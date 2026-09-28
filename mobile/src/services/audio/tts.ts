import * as Speech from 'expo-speech';
import { assistantStore, type SpokenEntry } from '@/state/assistant';
import { getSettings } from '@/state/settings';
import { haptic, hapticForBearing } from '../haptics';
import type { Bearing } from '../perception/types';
import { spatialAudio, type Earcon } from './spatialAudio';

export type SpeakPriority = 'normal' | 'high' | 'critical';

export type SpeakOptions = {
  priority?: SpeakPriority;
  kind?: SpokenEntry['kind'];
  bearing?: Bearing;
  angleDeg?: number;
  earcon?: Earcon | null;
  /** Record in the spoken-audio log (Safety screen). Default true. */
  log?: boolean;
  /** Replaces "Replay" target. Default true for normal narration. */
  replayable?: boolean;
  /** Queue after pending items instead of replacing them (streamed answers, sentence by sentence). */
  append?: boolean;
  language?: string;
};

type Item = { text: string; opts: SpeakOptions };

const LANG: Record<string, string> = { en: 'en-IN', hi: 'hi-IN' };

/**
 * Text-to-speech output with priorities:
 * - critical: interrupts anything being spoken (hazards).
 * - high: jumps the queue.
 * - normal: queued; stale normal items are dropped so speech never lags reality.
 * Voice can be muted in settings - then cues are still delivered via earcon + haptics and logged.
 */
class TtsService {
  private queue: Item[] = [];
  private speaking = false;
  private current: Item | null = null;
  private lastReplayable: { text: string; at: number } | null = null;
  private listeners = new Set<() => void>();

  get lastNarration() {
    return this.lastReplayable;
  }

  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  speak(text: string, opts: SpeakOptions = {}) {
    const clean = text.trim();
    if (!clean) return;
    const priority = opts.priority ?? 'normal';
    const item: Item = { text: clean, opts };

    if (opts.log !== false) {
      assistantStore.getState().logSpoken({ text: clean, kind: opts.kind ?? 'info', direction: opts.bearing });
    }
    if (opts.replayable ?? priority === 'normal') {
      this.lastReplayable = { text: clean, at: Date.now() };
      this.emit();
    }

    if (priority === 'critical') {
      this.queue = [];
      if (this.speaking) Speech.stop();
      this.speaking = false;
      this.queue.unshift(item);
    } else if (priority === 'high') {
      // Drop stale one-off narration, but keep the remaining sentences of a streamed answer.
      this.queue = this.queue.filter((q) => (q.opts.priority ?? 'normal') !== 'normal' || q.opts.append);
      this.queue.unshift(item);
    } else if (opts.append) {
      this.queue.push(item);
    } else {
      // Keep at most one pending normal item: the newest description is the relevant one.
      this.queue = this.queue.filter((q) => (q.opts.priority ?? 'normal') !== 'normal');
      this.queue.push(item);
    }
    this.pump();
  }

  /** Register a completed (streamed) answer as the Replay target and log it once. */
  recordNarration(text: string, kind: SpokenEntry['kind'] = 'info') {
    const clean = text.trim();
    if (!clean) return;
    this.lastReplayable = { text: clean, at: Date.now() };
    assistantStore.getState().logSpoken({ text: clean, kind });
    this.emit();
  }

  /** Resolves when the queue has drained (used to sequence listening after speaking). */
  whenIdle(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => (this.speaking || this.queue.length ? setTimeout(check, 120) : resolve());
      check();
    });
  }

  replayLast() {
    if (!this.lastReplayable) return false;
    this.speak(this.lastReplayable.text, { priority: 'high', log: false, replayable: false, earcon: null });
    return true;
  }

  stop() {
    this.queue = [];
    Speech.stop();
    this.speaking = false;
    this.setStatusIdle();
  }

  isSpeaking() {
    return this.speaking;
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  private setStatusIdle() {
    const s = assistantStore.getState();
    if (s.status === 'speaking') s.setStatus('idle');
  }

  private pump() {
    if (this.speaking) return;
    const item = this.queue.shift();
    if (!item) {
      this.current = null;
      this.setStatusIdle();
      return;
    }
    this.current = item;
    const settings = getSettings();
    const { opts } = item;

    const earcon: Earcon | null =
      opts.earcon !== undefined
        ? opts.earcon
        : opts.kind === 'critical'
          ? 'critical'
          : opts.kind === 'warning'
            ? 'warning'
            : null;
    if (earcon) spatialAudio.play(earcon, { bearing: opts.bearing, angleDeg: opts.angleDeg });
    if (opts.kind === 'critical') haptic('critical');
    else if (opts.kind === 'warning') haptic('warning');
    else if (opts.bearing && opts.kind === 'caution') haptic(hapticForBearing(opts.bearing));

    if (!settings.voiceEnabled) {
      // Muted: cue delivered by earcon/haptics only.
      this.current = null;
      setTimeout(() => this.pump(), 50);
      return;
    }

    this.speaking = true;
    assistantStore.getState().setStatus('speaking');
    const done = () => {
      if (this.current !== item) return;
      this.speaking = false;
      this.current = null;
      this.pump();
    };
    Speech.speak(item.text, {
      rate: settings.speechRate,
      pitch: 1.0,
      language: opts.language ?? LANG[settings.language] ?? 'en-IN',
      onDone: done,
      onStopped: () => {
        if (this.current === item) {
          this.speaking = false;
          this.current = null;
        }
      },
      onError: done,
    });
  }
}

export const tts = new TtsService();
