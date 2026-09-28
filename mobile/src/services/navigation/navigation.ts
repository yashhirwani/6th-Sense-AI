import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import { assistantStore } from '@/state/assistant';
import { navigationStore } from '@/state/navigation';
import { getSettings } from '@/state/settings';
import { api } from '../api/client';
import type { Place, RouteResult } from '../api/types';
import { tts } from '../audio/tts';
import { spatialAudio } from '../audio/spatialAudio';
import { captureForUpload, hasCamera } from '../camera/cameraRegistry';
import { haptic } from '../haptics';
import { getFix, placeName } from '../location';

const STEP_LENGTH_M = 0.7;
const OFF_HEADING_DEG = 25;
const CUE_INTERVAL_MS = 4000;

/**
 * Location codes printed and placed around a building. Payload format:
 *   6S:<place_id>:<node_id>          (compact)
 *   sixthsense://nav/<place_id>/<node_id>
 */
export function parseLocationCode(data: string): { placeId: string; nodeId: string } | null {
  const a = data.trim().match(/^6S:([\w-]+):([\w-]+)$/i);
  if (a) return { placeId: a[1], nodeId: a[2] };
  const b = data.trim().match(/^sixthsense:\/\/nav\/([\w-]+)\/([\w-]+)$/i);
  if (b) return { placeId: b[1], nodeId: b[2] };
  return null;
}

/** Signed smallest difference target - current, in degrees (-180..180). */
export function headingDelta(current: number, target: number) {
  return ((target - current + 540) % 360) - 180;
}

class NavigationService {
  private headingSub: { remove(): void } | null = null;
  private pedoSub: { remove(): void } | null = null;
  private stepsAtStart = 0;
  private lastCueAt = 0;

  // ------------------------------------------------------------ localization

  /** QR location code scanned (Explore / Scan camera). */
  async localizeFromCode(data: string): Promise<boolean> {
    const code = parseLocationCode(data);
    if (!code) return false;
    try {
      const res = await api<{ place: Place; node: { id: string; name: string } }>(`/v1/places/${code.placeId}/nodes/${code.nodeId}`);
      this.setLocalized(res.place, res.node, 'qr');
      return true;
    } catch {
      tts.speak('I read a location code, but I could not load the building map.', { priority: 'high' });
      return false;
    }
  }

  /** AprilTag localization: the backend finds tags in the photo and maps tag id -> node. */
  async localizeFromCamera(): Promise<boolean> {
    if (!hasCamera()) return false;
    try {
      const img = await captureForUpload(1280);
      const res = await api<{ place: Place | null; node: { id: string; name: string } | null; tags: number[] }>('/v1/nav/localize', {
        method: 'POST',
        body: { image_b64: img.base64 },
      });
      if (res.place && res.node) {
        this.setLocalized(res.place, res.node, 'apriltag');
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private setLocalized(place: Place, node: { id: string; name: string }, method: 'qr' | 'apriltag') {
    const prev = navigationStore.getState();
    navigationStore.getState().set({ place, node, method, lockedAt: Date.now() });
    haptic('success');
    if (prev.active && prev.route) {
      void this.reroute(node.id);
    } else if (prev.node?.id !== node.id) {
      tts.speak(`You are at ${node.name}, ${place.name}.`, { priority: 'high' });
    }
  }

  // ------------------------------------------------------------ routing

  async navigateTo(target: string) {
    const nav = navigationStore.getState();
    if (!getSettings().cloudProcessing || assistantStore.getState().backendOnline === false) {
      tts.speak('Indoor maps need the server. I can still look for signs and doors with the camera: say "find the exit".', { priority: 'high' });
      return;
    }
    let node = nav.node;
    if (!node || !nav.place || (nav.lockedAt && Date.now() - nav.lockedAt > 10 * 60 * 1000)) {
      tts.speak('Finding where you are. Point the camera at a location code or sign.', { priority: 'high' });
      const ok = await this.localizeFromCamera();
      node = navigationStore.getState().node;
      if (!ok || !node) {
        tts.speak('I could not find a location code. Scan a 6th Sense location code near you, then ask again.', { priority: 'high' });
        return;
      }
    }
    const place = navigationStore.getState().place!;
    try {
      const route = await api<RouteResult>(`/v1/places/${place.id}/route?from=${encodeURIComponent(node.id)}&to=${encodeURIComponent(target)}`);
      this.start(route, target);
    } catch (e) {
      tts.speak(`I couldn't plan a route to ${target}. ${e instanceof Error ? e.message : ''}`, { priority: 'high' });
    }
  }

  private async reroute(fromNode: string) {
    const nav = navigationStore.getState();
    if (!nav.place || !nav.route || !nav.destination) return;
    if (fromNode === nav.route.to_node) {
      this.arrive();
      return;
    }
    try {
      const route = await api<RouteResult>(`/v1/places/${nav.place.id}/route?from=${encodeURIComponent(fromNode)}&to=${encodeURIComponent(nav.route.to_node)}`);
      this.start(route, nav.destination, true);
    } catch {
      /* keep the current route */
    }
  }

  private start(route: RouteResult, destination: string, rerouted = false) {
    navigationStore.getState().set({ route, destination, stepIndex: 0, stepProgressM: 0, walkedM: 0, active: true });
    const first = route.steps[0];
    const intro = rerouted ? 'Route updated.' : `Route to ${destination}: ${Math.round(route.total_m)} metres.`;
    tts.speak(`${intro} ${first ? first.instruction : ''}`, { priority: 'high' });
    haptic('navigate-straight');
    this.watchSensors();
  }

  stop(announce = true) {
    this.headingSub?.remove();
    this.pedoSub?.remove();
    this.headingSub = null;
    this.pedoSub = null;
    navigationStore.getState().set({ active: false, route: null, destination: null, stepIndex: 0, stepProgressM: 0, walkedM: 0 });
    if (announce) tts.speak('Navigation stopped.', { priority: 'high' });
  }

  private arrive() {
    const dest = navigationStore.getState().destination;
    this.stop(false);
    haptic('arrived');
    spatialAudio.play('done');
    tts.speak(`You have arrived${dest ? ` at ${dest}` : ''}.`, { priority: 'high' });
  }

  private async watchSensors() {
    this.headingSub?.remove();
    this.pedoSub?.remove();
    try {
      this.headingSub = await Location.watchHeadingAsync((h) => {
        const heading = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
        navigationStore.getState().set({ heading });
        this.cueHeading(heading);
      });
    } catch {
      this.headingSub = null;
    }
    try {
      if ((await Pedometer.isAvailableAsync()) && (await Pedometer.requestPermissionsAsync()).granted) {
        this.stepsAtStart = 0;
        this.pedoSub = Pedometer.watchStepCount(({ steps }) => this.onSteps(steps));
      }
    } catch {
      this.pedoSub = null;
    }
  }

  private cueHeading(heading: number) {
    const nav = navigationStore.getState();
    const step = nav.route?.steps[nav.stepIndex];
    if (!nav.active || !step || step.heading_deg == null) return;
    const now = Date.now();
    if (now - this.lastCueAt < CUE_INTERVAL_MS) return;
    const d = headingDelta(heading, step.heading_deg);
    if (Math.abs(d) <= OFF_HEADING_DEG) return;
    this.lastCueAt = now;
    const left = d < 0;
    const cue = Math.abs(d) > 100 ? 'Turn around.' : left ? 'Turn slightly left.' : 'Turn slightly right.';
    navigationStore.getState().set({ lastCue: cue });
    haptic(left ? 'navigate-left' : 'navigate-right');
    spatialAudio.play('navigate', { bearing: left ? 'left' : 'right' });
    tts.speak(cue, { priority: 'high', replayable: false, bearing: left ? 'left' : 'right', earcon: null });
  }

  private onSteps(totalSteps: number) {
    const nav = navigationStore.getState();
    if (!nav.active || !nav.route) return;
    const walked = totalSteps * STEP_LENGTH_M;
    const step = nav.route.steps[nav.stepIndex];
    const doneBefore = nav.route.steps.slice(0, nav.stepIndex).reduce((a, s) => a + s.distance_m, 0);
    const onStep = Math.max(0, walked - doneBefore);
    navigationStore.getState().set({ walkedM: walked, stepProgressM: onStep });
    if (step && onStep >= step.distance_m) {
      const next = nav.stepIndex + 1;
      if (next >= nav.route.steps.length) {
        this.arrive();
        return;
      }
      navigationStore.getState().set({ stepIndex: next, stepProgressM: 0 });
      const n = nav.route.steps[next];
      haptic('navigate-straight');
      tts.speak(n.instruction, { priority: 'high' });
    }
  }

  // ------------------------------------------------------------ outdoor

  /** Outdoor GPS mode: where am I + which way am I facing (turn-by-turn street routing is not implemented). */
  async announceOutdoor() {
    const fix = await getFix(8000);
    if (!fix) {
      tts.speak('I could not get a GPS fix. Move near a window or outside.', { priority: 'high' });
      return;
    }
    const street = await placeName(fix);
    let heading: number | null = null;
    try {
      const h = await Location.getHeadingAsync();
      heading = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
    } catch {
      heading = null;
    }
    navigationStore.getState().set({ outdoor: { street, heading, at: Date.now() } });
    const dir = heading == null ? '' : `, facing ${compassWord(heading)}`;
    const acc = fix.accuracy_m ? ` GPS accuracy about ${Math.round(fix.accuracy_m)} metres.` : '';
    tts.speak(`${street ? `You are near ${street}` : 'I have your GPS position'}${dir}.${acc}`, { priority: 'high' });
  }
}

export function compassWord(deg: number): string {
  const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  return names[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

export const navigation = new NavigationService();
