import { angleOf, bearingOf, clockOf, estimateDistance, iou } from './geometry';
import { labelInfo } from './labels';
import type { Detection, RawDetection } from './types';

type Track = {
  id: number;
  classId: number;
  box: RawDetection['box'];
  score: number;
  age: number;
  missed: number;
  /** exponential moving average of relative height growth per second */
  approachRate: number;
  lastSeen: number;
};

const MATCH_IOU = 0.3;
const MAX_MISSED = 4;
/** Minimum frames before a detection is announced (debounces flicker / single-frame false positives). */
export const MIN_AGE_TO_REPORT = 2;

/**
 * Lightweight IoU tracker: keeps stable ids across frames (so pins don't jump and alerts aren't repeated)
 * and measures how fast each object's apparent size grows - the "approaching" signal used by hazard rules.
 */
export class Tracker {
  private tracks: Track[] = [];
  private nextId = 1;

  update(raw: RawDetection[], now: number): Detection[] {
    const unmatched = new Set(this.tracks.map((_, i) => i));
    const matchedTracks: Track[] = [];

    // Greedy matching, highest score first.
    for (const det of [...raw].sort((a, b) => b.score - a.score)) {
      let best = -1;
      let bestIou = MATCH_IOU;
      for (const i of unmatched) {
        const t = this.tracks[i];
        if (t.classId !== det.classId) continue;
        const o = iou(t.box, det.box);
        if (o > bestIou) {
          bestIou = o;
          best = i;
        }
      }
      if (best >= 0) {
        unmatched.delete(best);
        const t = this.tracks[best];
        const dt = Math.max(0.03, (now - t.lastSeen) / 1000);
        const growth = t.box.h > 0 ? (det.box.h - t.box.h) / t.box.h / dt : 0;
        t.approachRate = t.approachRate * 0.6 + growth * 0.4;
        // Light smoothing of the box so on-screen pins are steady.
        t.box = {
          x: t.box.x * 0.4 + det.box.x * 0.6,
          y: t.box.y * 0.4 + det.box.y * 0.6,
          w: t.box.w * 0.4 + det.box.w * 0.6,
          h: t.box.h * 0.4 + det.box.h * 0.6,
        };
        t.score = det.score;
        t.age += 1;
        t.missed = 0;
        t.lastSeen = now;
        matchedTracks.push(t);
      } else {
        const t: Track = { id: this.nextId++, classId: det.classId, box: det.box, score: det.score, age: 1, missed: 0, approachRate: 0, lastSeen: now };
        matchedTracks.push(t);
      }
    }

    for (const i of unmatched) {
      const t = this.tracks[i];
      t.missed += 1;
      if (t.missed <= MAX_MISSED) matchedTracks.push(t);
    }
    this.tracks = matchedTracks;

    return this.tracks
      .filter((t) => t.missed === 0 && t.age >= MIN_AGE_TO_REPORT)
      .map((t) => toDetection(t));
  }

  reset() {
    this.tracks = [];
  }
}

function toDetection(t: Track): Detection {
  const info = labelInfo(t.classId);
  const angleDeg = angleOf(t.box);
  return {
    id: t.id,
    label: info.label,
    name: info.name,
    icon: info.icon,
    confidence: t.score,
    box: t.box,
    angleDeg,
    bearing: bearingOf(angleDeg),
    clock: clockOf(angleDeg),
    distanceM: estimateDistance(t.box, info.height),
    approachRate: t.approachRate,
    age: t.age,
  };
}
