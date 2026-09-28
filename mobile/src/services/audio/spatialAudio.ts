import { getSettings } from '@/state/settings';
import type { Bearing } from '../perception/types';

/**
 * Spatial audio abstraction (spec item 12).
 *
 * Current implementation: synthesized earcons with STEREO panning (Web Audio StereoPannerNode via
 * react-native-audio-api) - left/right/front are audible on headphones or stereo speakers.
 * Spoken TTS cannot be panned through the native TTS engines, so the direction is also spoken in words.
 *
 * `SpatialAudioEngine` is the seam for adding HRTF/binaural rendering later (e.g. a PannerNode with
 * panningModel 'HRTF', or head-tracked audio) without touching callers.
 */
export type Earcon = 'info' | 'object' | 'navigate' | 'warning' | 'critical' | 'listen' | 'done' | 'error';

export type SpatialPosition = { bearing?: Bearing; angleDeg?: number };

export interface SpatialAudioEngine {
  readonly kind: 'stereo' | 'hrtf' | 'none';
  play(earcon: Earcon, pos?: SpatialPosition): void;
}

type Tone = { f: number; dur: number; gap: number; type: 'sine' | 'square' | 'triangle'; gain: number };

const EARCONS: Record<Earcon, Tone[]> = {
  info: [{ f: 660, dur: 0.09, gap: 0, type: 'sine', gain: 0.35 }],
  object: [
    { f: 620, dur: 0.07, gap: 0.05, type: 'sine', gain: 0.35 },
    { f: 880, dur: 0.09, gap: 0, type: 'sine', gain: 0.35 },
  ],
  navigate: [{ f: 520, dur: 0.12, gap: 0, type: 'triangle', gain: 0.4 }],
  listen: [
    { f: 540, dur: 0.06, gap: 0.03, type: 'sine', gain: 0.3 },
    { f: 810, dur: 0.08, gap: 0, type: 'sine', gain: 0.3 },
  ],
  done: [
    { f: 810, dur: 0.06, gap: 0.03, type: 'sine', gain: 0.25 },
    { f: 540, dur: 0.08, gap: 0, type: 'sine', gain: 0.25 },
  ],
  warning: [
    { f: 880, dur: 0.14, gap: 0.08, type: 'triangle', gain: 0.5 },
    { f: 880, dur: 0.14, gap: 0, type: 'triangle', gain: 0.5 },
  ],
  critical: [
    { f: 1040, dur: 0.16, gap: 0.06, type: 'square', gain: 0.35 },
    { f: 1040, dur: 0.16, gap: 0.06, type: 'square', gain: 0.35 },
    { f: 1040, dur: 0.22, gap: 0, type: 'square', gain: 0.35 },
  ],
  error: [{ f: 220, dur: 0.25, gap: 0, type: 'triangle', gain: 0.4 }],
};

/** -1 (hard left) .. 1 (hard right) from an angle, or a coarse bearing. */
export function panFor(pos?: SpatialPosition): number {
  if (!pos) return 0;
  if (pos.angleDeg != null) return Math.max(-1, Math.min(1, pos.angleDeg / 30));
  return pos.bearing === 'left' ? -0.85 : pos.bearing === 'right' ? 0.85 : 0;
}

class StereoEngine implements SpatialAudioEngine {
  readonly kind = 'stereo' as const;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ctx: any = null;
  private failed = false;

  private context() {
    if (this.ctx || this.failed) return this.ctx;
    try {
      // Lazy require: the native module is only present in development/production builds.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { AudioContext } = require('react-native-audio-api');
      this.ctx = new AudioContext();
    } catch (e) {
      this.failed = true;
      if (__DEV__) console.warn('[spatialAudio] audio engine unavailable', e);
    }
    return this.ctx;
  }

  play(earcon: Earcon, pos?: SpatialPosition) {
    const ctx = this.context();
    if (!ctx) return;
    try {
      const panner = ctx.createStereoPanner();
      panner.pan.value = getSettings().spatialAudio ? panFor(pos) : 0;
      panner.connect(ctx.destination);
      let t = ctx.currentTime + 0.01;
      for (const tone of EARCONS[earcon]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = tone.type;
        osc.frequency.value = tone.f;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(tone.gain, t + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + tone.dur);
        osc.connect(gain);
        gain.connect(panner);
        osc.start(t);
        osc.stop(t + tone.dur + 0.02);
        t += tone.dur + tone.gap;
      }
    } catch (e) {
      if (__DEV__) console.warn('[spatialAudio] play failed', e);
    }
  }
}

export const spatialAudio: SpatialAudioEngine = new StereoEngine();
