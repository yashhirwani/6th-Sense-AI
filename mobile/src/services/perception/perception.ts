import { perceptionStore } from '@/state/perception';
import { tts } from '../audio/tts';
import { boxToUpright, type FrameOrientation } from './geometry';
import { evaluateHazards } from './hazards';
import { Tracker } from './tracker';
import type { Detection, Hazard, RawDetection } from './types';

const tracker = new Tracker();

/** Server-side hazards (open-vocabulary: stairs, wet floor, construction...) stay visible for a while. */
const SERVER_HAZARD_TTL_MS = 8000;
let serverHazards: Hazard[] = [];

/** Per-hazard announcement cooldown so the same object isn't repeated every frame. */
const lastAnnounced = new Map<string, { at: number; severity: Hazard['severity'] }>();
const COOLDOWN_MS: Record<Hazard['severity'], number> = { critical: 6000, warning: 10000, caution: 20000, safe: 60000 };

let frameTimes: number[] = [];
let hazardAlertsEnabled = true;

export type DetectionListener = (detections: Detection[]) => void;
const listeners = new Set<DetectionListener>();

/** Subscribe to every processed frame (used by "find object" guidance). */
export function onDetections(fn: DetectionListener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setHazardAlerts(enabled: boolean) {
  hazardAlertsEnabled = enabled;
}

/** Called (on the JS thread) for every inferred camera frame. */
export function handleFrameResults(raw: RawDetection[], orientation: FrameOrientation, mirrored: boolean) {
  const now = Date.now();
  frameTimes.push(now);
  frameTimes = frameTimes.filter((t) => now - t < 2000);
  const fps = frameTimes.length / 2;

  const upright = raw.map((r) => ({ ...r, box: boxToUpright(r.box, orientation, mirrored) }));
  const detections = tracker.update(upright, now);
  serverHazards = serverHazards.filter((h) => now - h.at < SERVER_HAZARD_TTL_MS);
  const hazards = [...evaluateHazards(detections, now), ...serverHazards];

  perceptionStore.getState().setResults(detections, hazards, fps);
  listeners.forEach((l) => l(detections));
  if (hazardAlertsEnabled) announceHazards(hazards, now);
}

export function addServerHazards(hazards: Hazard[]) {
  const now = Date.now();
  serverHazards = [...serverHazards.filter((h) => !hazards.some((n) => n.label === h.label)), ...hazards.map((h) => ({ ...h, at: now }))];
  const s = perceptionStore.getState();
  s.setResults(s.detections, [...evaluateHazards(s.detections, now), ...serverHazards], s.fps);
  if (hazardAlertsEnabled) announceHazards(serverHazards, now);
}

function announceHazards(hazards: Hazard[], now: number) {
  for (const h of hazards) {
    if (h.severity === 'safe' || h.severity === 'caution') continue; // cautions are shown, and spoken on request
    const key = h.trackId != null ? `t${h.trackId}` : `s:${h.label}`;
    const prev = lastAnnounced.get(key);
    const escalated = prev && rank(h.severity) > rank(prev.severity);
    if (prev && !escalated && now - prev.at < COOLDOWN_MS[h.severity]) continue;
    lastAnnounced.set(key, { at: now, severity: h.severity });
    tts.speak(h.message, {
      priority: h.severity === 'critical' ? 'critical' : 'high',
      kind: h.severity,
      bearing: h.bearing,
      replayable: false,
    });
    break; // one alert per frame; the next most severe gets its turn on the next frame
  }
  for (const [k, v] of lastAnnounced) if (now - v.at > 60000) lastAnnounced.delete(k);
}

const rank = (s: Hazard['severity']) => ({ safe: 0, caution: 1, warning: 2, critical: 3 })[s];

export function resetPerception() {
  tracker.reset();
  frameTimes = [];
  perceptionStore.getState().setResults([], serverHazards, 0);
}
