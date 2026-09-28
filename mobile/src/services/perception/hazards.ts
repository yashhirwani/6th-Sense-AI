import { spokenBearing, spokenDistance } from './geometry';
import { COCO_LABELS, type LabelKind } from './labels';
import type { Detection, Hazard, Severity } from './types';

/** Relative size growth per second above which an object is treated as approaching. */
export const APPROACH_RATE = 0.25;

const kindOf = (label: string): LabelKind | undefined => COCO_LABELS.find((l) => l.label === label)?.kind;

/**
 * On-device hazard rules over tracked COCO detections. Deliberately conservative wording:
 * this is assistive information, never a guarantee of safety.
 * Classes COCO cannot see (stairs, wet floor, manholes, construction) come from the backend
 * open-vocabulary detector and are merged in by the perception service.
 */
export function evaluateHazards(detections: Detection[], now = Date.now()): Hazard[] {
  const out: Hazard[] = [];
  for (const d of detections) {
    const kind = kindOf(d.label);
    const dist = d.distanceM;
    const approaching = d.approachRate > APPROACH_RATE;
    const inPath = d.bearing === 'front';
    let severity: Severity | null = null;
    let lead = '';

    switch (kind) {
      case 'vehicle':
        if ((dist != null && dist < 6) || approaching) {
          severity = approaching || (dist != null && dist < 3) ? 'critical' : 'warning';
          lead = approaching ? 'Stop.' : 'Careful.';
        } else if (dist == null || dist < 15) {
          severity = 'caution';
        }
        break;
      case 'cycle':
        if (approaching && (dist == null || dist < 8)) {
          severity = dist != null && dist < 3 ? 'critical' : 'warning';
          lead = 'Careful.';
        } else if (dist != null && dist < 4) {
          severity = 'caution';
        }
        break;
      case 'animal':
        if (d.label === 'dog' || d.label === 'cow' || d.label === 'horse') {
          if (dist != null && dist < 3) severity = approaching ? 'warning' : 'caution';
        }
        break;
      case 'obstacle':
      case 'furniture':
        if (inPath && dist != null && dist < 1.5) {
          severity = dist < 0.8 ? 'warning' : 'caution';
        }
        break;
      case 'person':
        if (inPath && approaching && dist != null && dist < 2) severity = 'caution';
        break;
      default:
        break;
    }
    if (!severity) continue;

    const what = d.name.charAt(0).toUpperCase() + d.name.slice(1);
    const where = [spokenDistance(dist), spokenBearing(d.bearing)].filter(Boolean).join(' ');
    const verb = approaching ? 'approaching' : '';
    const message = [lead, `${what} ${verb}`.trim(), where].filter(Boolean).join(' ').replace(/\s+/g, ' ') + '.';

    out.push({
      id: `trk-${d.id}`,
      trackId: d.id,
      label: d.label,
      title: approaching ? `Approaching ${what}` : what,
      severity,
      bearing: d.bearing,
      clock: d.clock,
      distanceM: dist,
      approaching,
      message,
      source: 'device',
      at: now,
    });
  }
  const rank: Record<Severity, number> = { critical: 3, warning: 2, caution: 1, safe: 0 };
  return out.sort((a, b) => rank[b.severity] - rank[a.severity] || (a.distanceM ?? 99) - (b.distanceM ?? 99));
}

/** Nothing within ~3m straight ahead -> the Stitch "Area appears clear" banner may be shown. */
export function isPathClear(detections: Detection[]): boolean {
  return !detections.some((d) => d.bearing === 'front' && d.distanceM != null && d.distanceM < 3);
}
