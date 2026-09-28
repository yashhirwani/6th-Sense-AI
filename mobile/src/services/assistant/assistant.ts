import { router } from 'expo-router';
import { assistantStore } from '@/state/assistant';
import { perceptionStore } from '@/state/perception';
import { getSettings, useSettings, type SpeechRate } from '@/state/settings';
import { api, ApiError, assistStream, probeBackend } from '../api/client';
import type { AssistMode, AssistRequest, AssistResult, WireDetection } from '../api/types';
import { abortListening, listenOnce, stopListening } from '../audio/stt';
import { spatialAudio } from '../audio/spatialAudio';
import { tts } from '../audio/tts';
import { captureForUpload, captureFull, hasCamera } from '../camera/cameraRegistry';
import { emergency } from '../emergency/emergency';
import { haptic, hapticForBearing } from '../haptics';
import { getFix, lastFix } from '../location';
import { describeMemory, observe, recall, remember, syncPending } from '../memory';
import { navigation } from '../navigation/navigation';
import { recognizeText } from '../ocr';
import { classIdForName, labelInfo } from '../perception/labels';
import { addServerHazards, onDetections } from '../perception/perception';
import type { Detection, Hazard } from '../perception/types';
import { saveScan } from '../scans';
import { parseIntent, type Intent, type ScanKind } from './intents';
import { describeLocally, findGuidance } from './localDescribe';
import { SentenceStreamer } from './sentences';

export type QuickAction = 'describe' | 'find' | 'read' | 'navigate' | 'ask' | 'scan';

const FIND_TIMEOUT_MS = 30000;
const CONVERSATION_TTL_MS = 5 * 60 * 1000;
/** If the cloud hasn't produced words by then, speak the on-device summary first (never leave the user in silence). */
const INTERIM_AFTER_MS = 2500;

function toWire(d: Detection): WireDetection {
  return {
    label: d.label,
    confidence: Math.round(d.confidence * 100) / 100,
    box: d.box,
    bearing: d.bearing,
    clock: d.clock,
    distance_m: d.distanceM,
    approaching: d.approachRate > 0.25,
  };
}

class Assistant {
  private initialized = false;
  private abort: AbortController | null = null;
  private conversation: { id: string; at: number } | null = null;
  private findSession: { classId: number; name: string; until: number; lastSpoken: number; found: boolean } | null = null;
  private probeTimer: ReturnType<typeof setInterval> | null = null;

  /** Called once from the root layout. */
  init() {
    if (this.initialized) return;
    this.initialized = true;
    void probeBackend().then((caps) => caps && syncPending());
    this.probeTimer = setInterval(() => void probeBackend(), 30000);
    onDetections((dets) => {
      observe(dets);
      this.onFindFrame(dets);
    });
  }

  // ---------------------------------------------------------------- voice entry points

  /** Orb / bottom-bar mic: start listening, or stop if already listening / cancel if busy. */
  toggleVoice(prompt?: string) {
    const { status } = assistantStore.getState();
    if (status === 'listening') {
      stopListening();
      return;
    }
    if (status === 'processing') {
      this.cancel();
      return;
    }
    void this.listen(prompt);
  }

  async listen(prompt?: string) {
    tts.stop();
    const store = assistantStore.getState();
    if (prompt) {
      tts.speak(prompt, { priority: 'high', log: false, replayable: false, earcon: null });
      await tts.whenIdle();
    }
    haptic('listen');
    spatialAudio.play('listen');
    store.setError(null);
    store.setPartial('');
    store.setStatus('listening');
    const res = await listenOnce((t) => assistantStore.getState().setPartial(t));
    assistantStore.getState().setPartial('');
    if (!res.ok) {
      assistantStore.getState().setStatus('idle');
      if (res.reason === 'no-speech') {
        spatialAudio.play('done');
        tts.speak("I didn't catch that. Tap and try again.", { priority: 'high', log: false, replayable: false });
      } else if (res.reason !== 'aborted') {
        this.fail(res.message ?? 'Voice input failed.');
      }
      return;
    }
    spatialAudio.play('done');
    await this.handleUtterance(res.transcript);
  }

  cancel() {
    this.abort?.abort();
    this.abort = null;
    abortListening();
    tts.stop();
    this.stopFind(false);
    assistantStore.getState().setStatus('idle');
  }

  /** Home "Quick Actions" tiles. */
  quick(action: QuickAction) {
    haptic('tap');
    switch (action) {
      case 'describe':
        return this.run({ type: 'describe' });
      case 'read':
        return this.run({ type: 'read' });
      case 'find':
        return this.listen('What should I look for?');
      case 'navigate':
        router.navigate('/explore');
        return this.listen('Where would you like to go?');
      case 'ask':
        return this.listen('What would you like to know?');
      case 'scan':
        router.navigate('/scan');
        return;
    }
  }

  async handleUtterance(text: string) {
    assistantStore.getState().addTurn({ role: 'user', text });
    await this.run(parseIntent(text));
  }

  // ---------------------------------------------------------------- intent routing

  async run(intent: Intent) {
    try {
      switch (intent.type) {
        case 'describe':
          return await this.askVision('describe', 'Describe what is around me.');
        case 'ask':
          return await this.askVision('ask', intent.query);
        case 'people':
          return await this.askVision('people', 'Who is around me, and is anyone trying to get my attention?');
        case 'read':
          return await this.read(intent.follow);
        case 'find':
          return await this.find(intent.target);
        case 'where':
          return await this.where(intent.target);
        case 'remember':
          return await this.rememberHere(intent.target);
        case 'navigate':
          router.navigate('/explore');
          return await navigation.navigateTo(intent.target);
        case 'emergency':
          router.navigate('/safety');
          return emergency.trigger('voice');
        case 'repeat':
          if (!tts.replayLast()) this.say("I haven't said anything yet.");
          return;
        case 'stop':
          return this.cancel();
        case 'scan':
          return this.openScan(intent.kind);
        case 'setting':
          return this.applySetting(intent.change);
      }
    } catch (e) {
      this.fail(e instanceof Error ? e.message : String(e));
    }
  }

  private say(text: string, source: 'device' | 'cloud' | 'local-llm' = 'device') {
    assistantStore.getState().addTurn({ role: 'assistant', text, source });
    tts.speak(text);
  }

  private fail(message: string) {
    assistantStore.getState().setError(message);
    assistantStore.getState().setStatus('idle');
    haptic('error');
    tts.speak(message, { priority: 'high', replayable: false });
  }

  private cloudReady() {
    return getSettings().cloudProcessing && assistantStore.getState().backendOnline !== false;
  }

  // ---------------------------------------------------------------- scene understanding / conversation

  /**
   * Camera frame + on-device detections -> backend VLM (streamed) -> speech.
   * Offline or with cloud disabled, answers from on-device detections and says so.
   */
  private async askVision(mode: AssistMode, query: string) {
    const dets = perceptionStore.getState().detections;
    if (!this.cloudReady()) {
      const local = describeLocally(dets);
      const text =
        mode === 'describe' || mode === 'people'
          ? local
          : `${getSettings().cloudProcessing ? "I can't reach the server, so I can't answer questions right now." : 'Cloud reasoning is turned off, so I can only report what I detect.'} ${local}`;
      this.say(text);
      return;
    }
    let image: string | undefined;
    if (hasCamera()) {
      try {
        image = (await captureForUpload()).base64;
      } catch {
        image = undefined;
      }
    }
    if (!image && (mode === 'describe' || mode === 'people')) {
      this.say(`The camera isn't active. ${describeLocally(dets)}`);
      return;
    }
    const interim = (mode === 'describe' || mode === 'people') && dets.length ? describeLocally(dets, { brief: true }) : undefined;
    await this.stream({ mode, query, image_b64: image, detections: dets.map(toWire) }, interim);
  }

  private async stream(partial: Omit<AssistRequest, 'language' | 'location' | 'conversation_id'>, interim?: string): Promise<AssistResult | null> {
    const store = assistantStore.getState();
    store.setStatus('processing');
    this.abort = new AbortController();
    const conv = this.conversation && Date.now() - this.conversation.at < CONVERSATION_TTL_MS ? this.conversation.id : null;
    const fix = lastFix();
    const req: AssistRequest = {
      ...partial,
      language: getSettings().language,
      location: fix ? { lat: fix.lat, lon: fix.lon, accuracy_m: fix.accuracy_m } : null,
      conversation_id: conv,
      allow_faces: getSettings().faceRecognition,
    };
    const t0 = Date.now();
    let firstAudio: number | null = null;
    const splitter = new SentenceStreamer();
    let spoken = '';
    let interimTimer: ReturnType<typeof setTimeout> | null = interim
      ? setTimeout(() => {
          if (spoken) return;
          firstAudio ??= Date.now() - t0;
          tts.speak(`${interim} Getting more detail.`, { append: true, log: false, replayable: false, earcon: null });
        }, INTERIM_AFTER_MS)
      : null;
    const speakSentence = (s: string) => {
      if (interimTimer) {
        clearTimeout(interimTimer);
        interimTimer = null;
      }
      firstAudio ??= Date.now() - t0;
      spoken += (spoken ? ' ' : '') + s;
      tts.speak(s, { append: true, log: false, replayable: false, earcon: null });
    };
    try {
      const result = await assistStream(req, (delta) => splitter.push(delta).forEach(speakSentence), this.abort.signal);
      const rest = splitter.flush();
      if (rest) speakSentence(rest);
      // If the server sent no deltas (non-streaming engine), speak the final answer now.
      if (!spoken && result.answer) speakSentence(result.answer);
      this.conversation = { id: result.conversation_id, at: Date.now() };
      tts.recordNarration(result.answer || spoken);
      assistantStore.getState().addTurn({ role: 'assistant', text: result.answer || spoken, source: result.source === 'cloud-vlm' ? 'cloud' : result.source === 'local-llm' ? 'local-llm' : 'device' });
      if (result.hazards.length) {
        const now = Date.now();
        addServerHazards(
          result.hazards.map<Hazard>((h, i) => ({
            id: `srv-${h.label}-${i}`,
            label: h.label,
            title: h.label.charAt(0).toUpperCase() + h.label.slice(1),
            severity: h.severity,
            bearing: h.bearing,
            clock: h.bearing === 'left' ? 10 : h.bearing === 'right' ? 2 : 12,
            distanceM: h.distance_m,
            approaching: false,
            message: h.message,
            source: 'server',
            at: now,
          })),
        );
      }
      void api('/v1/telemetry/latency', {
        method: 'POST',
        body: { kind: req.mode, total_ms: Date.now() - t0, first_audio_ms: firstAudio, server_ms: result.latency_ms, source: result.source },
      }).catch(() => undefined);
      if (assistantStore.getState().status === 'processing') assistantStore.getState().setStatus(tts.isSpeaking() ? 'speaking' : 'idle');
      return result;
    } catch (e) {
      if (this.abort?.signal.aborted) return null;
      const dets = perceptionStore.getState().detections;
      const msg = e instanceof ApiError ? e.message : 'Something went wrong.';
      this.say(`${msg} ${partial.mode === 'describe' ? describeLocally(dets) : ''}`.trim());
      assistantStore.getState().setStatus('idle');
      return null;
    } finally {
      if (interimTimer) clearTimeout(interimTimer);
      this.abort = null;
    }
  }

  // ---------------------------------------------------------------- reading

  private async read(follow?: 'summarize' | 'translate') {
    if (!hasCamera()) {
      router.navigate('/scan');
      this.say('Opening the scanner. Point the camera at the text and ask me to read again.');
      return;
    }
    assistantStore.getState().setStatus('processing');
    tts.speak('Reading.', { priority: 'high', log: false, replayable: false, earcon: 'info' });
    const uri = await captureFull();
    let text = '';
    try {
      text = await recognizeText(uri);
    } catch {
      text = '';
    }

    if (follow || (!text && this.cloudReady())) {
      if (!this.cloudReady()) {
        this.say(text ? `${text}\n(Summaries and translation need the server.)` : "I couldn't find readable text.");
        assistantStore.getState().setStatus('idle');
        return;
      }
      const img = await captureForUpload(1280);
      const q = follow === 'summarize' ? 'Summarize this document briefly.' : follow === 'translate' ? `Translate this text into ${getSettings().language === 'hi' ? 'Hindi' : 'English'}.` : 'Read all the text in this image, in reading order.';
      const r = await this.stream({ mode: follow ? 'document' : 'read', query: q, image_b64: img.base64, ocr_text: text || undefined });
      if (r) saveScan('document', r.answer.slice(0, 60), r.answer, r.structured);
      return;
    }
    if (!text) {
      this.say("I couldn't find readable text. Hold the page flat, about 30 centimetres away, with good light.");
      assistantStore.getState().setStatus('idle');
      return;
    }
    saveScan('document', text.split('\n')[0]?.slice(0, 60) ?? 'Text', text, null);
    assistantStore.getState().addTurn({ role: 'assistant', text, source: 'device' });
    for (const para of text.split(/\n{1,}/).filter(Boolean)) tts.speak(para, { append: true, log: false, replayable: false, earcon: null });
    tts.recordNarration(text);
  }

  // ---------------------------------------------------------------- find / memory

  private async find(target: string) {
    const classId = classIdForName(target);
    if (classId != null) {
      const name = labelInfo(classId).name;
      this.findSession = { classId, name, until: Date.now() + FIND_TIMEOUT_MS, lastSpoken: 0, found: false };
      this.say(`Looking for ${name}. Move the phone slowly from side to side.`);
      return;
    }
    // Not a class the phone can detect: ask the server's open-vocabulary detector / VLM, and check memory.
    const mem = await recall(target);
    if (this.cloudReady() && hasCamera()) {
      const r = await this.stream({
        mode: 'find',
        query: target,
        image_b64: (await captureForUpload()).base64,
        detections: perceptionStore.getState().detections.map(toWire),
      });
      if (r && mem && /not (see|find)|can't see|cannot see/i.test(r.answer)) this.say(describeMemory(mem));
      return;
    }
    if (mem) this.say(`I can't detect ${target} with the camera offline. ${describeMemory(mem)}`);
    else this.say(`I can't recognise ${target} on this device${getSettings().cloudProcessing ? ' without the server' : ''}.`);
  }

  private onFindFrame(dets: Detection[]) {
    const s = this.findSession;
    if (!s) return;
    const now = Date.now();
    if (now > s.until) {
      this.stopFind(true);
      return;
    }
    // Largest (usually nearest) instance of the target class.
    const hit = dets.filter((d) => d.name === s.name).sort((a, b) => b.box.h * b.box.w - a.box.h * a.box.w)[0];
    if (!hit) return;
    if (now - s.lastSpoken < 2500) return;
    s.lastSpoken = now;
    if (!s.found) {
      s.found = true;
      s.until = now + 15000; // keep guiding for a while after the first sighting
      haptic('object');
    } else {
      haptic(hapticForBearing(hit.bearing));
    }
    spatialAudio.play('object', { angleDeg: hit.angleDeg });
    tts.speak(findGuidance(hit), { priority: 'high', replayable: true, bearing: hit.bearing, earcon: null });
    if (hit.bearing === 'front' && hit.distanceM != null && hit.distanceM < 0.8) {
      tts.speak(`The ${s.name} is right in front of you.`, { priority: 'high', earcon: null });
      haptic('arrived');
      this.findSession = null;
    }
  }

  private stopFind(announce: boolean) {
    if (!this.findSession) return;
    const { name, found } = this.findSession;
    this.findSession = null;
    if (announce && !found) this.say(`I couldn't find a ${name}. Try another direction, or ask where you left it.`);
  }

  private async where(target: string) {
    const mem = await recall(target);
    if (mem) this.say(describeMemory(mem));
    else this.say(`I don't have a memory of your ${target}. When you put it down, say "remember my ${target} is here".`);
  }

  private async rememberHere(target: string) {
    let context: string | null = null;
    if (this.cloudReady() && hasCamera()) {
      assistantStore.getState().setStatus('processing');
      try {
        const r = await this.stream({
          mode: 'ask',
          query: `In one short phrase, describe where the ${target} is placed (for example "on the wooden desk by the window"). If you cannot see it, describe the surface or spot in front of the camera.`,
          image_b64: (await captureForUpload()).base64,
        });
        context = r?.answer ?? null;
      } catch {
        context = null;
      }
    }
    await getFix(3000);
    await remember(target, context, 'user');
    haptic('success');
    this.say(`Okay, I'll remember where your ${target} is.`);
  }

  // ---------------------------------------------------------------- misc

  private openScan(kind: ScanKind) {
    router.navigate({ pathname: '/scan', params: { mode: kind } });
  }

  private applySetting(change: 'slower' | 'faster' | 'mute' | 'unmute') {
    const s = getSettings();
    const rates: SpeechRate[] = [1, 1.25, 1.5];
    const i = rates.indexOf(s.speechRate);
    if (change === 'slower') useSettings.getState().update({ speechRate: rates[Math.max(0, i - 1)] });
    if (change === 'faster') useSettings.getState().update({ speechRate: rates[Math.min(rates.length - 1, i + 1)] });
    if (change === 'mute') useSettings.getState().update({ voiceEnabled: false });
    if (change === 'unmute') useSettings.getState().update({ voiceEnabled: true });
    haptic('success');
    tts.speak(change === 'mute' ? 'Voice muted.' : 'Okay.', { priority: 'high', log: false, replayable: false });
  }

  dispose() {
    if (this.probeTimer) clearInterval(this.probeTimer);
  }
}

export const assistant = new Assistant();
