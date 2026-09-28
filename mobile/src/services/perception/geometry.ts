import type { Bearing, Box } from './types';

/**
 * Camera model assumptions (documented, not magic):
 * - Typical phone main camera ~26mm-equivalent, 4:3 sensor. Held in portrait, the upright image is 3:4
 *   and its horizontal field of view (short side) is ~54 degrees.
 * - The detector input is a centred square crop ("cover") of the upright image, so it spans the full
 *   width (54 degrees) and the central 75% of the height.
 * The distance estimate is therefore APPROXIMATE and always spoken as "about N metres".
 */
export const PORTRAIT_HFOV_DEG = 54;
const FOCAL_NORM = 0.5 / Math.tan(((PORTRAIT_HFOV_DEG / 2) * Math.PI) / 180); // focal length in units of crop width

export type FrameOrientation = 'up' | 'right' | 'down' | 'left';

/**
 * Convert a normalised point in the raw (sensor-oriented) buffer to upright image coordinates.
 * `orientation` is VisionCamera's Frame.orientation: how the pixel data is rotated relative to upright.
 * 'right' = content rotated +90 degrees (clockwise), 'left' = -90 degrees.
 */
export function toUpright(u: number, v: number, orientation: FrameOrientation, mirrored = false): [number, number] {
  let x: number;
  let y: number;
  switch (orientation) {
    case 'right': // scene top is at buffer right
      x = v;
      y = 1 - u;
      break;
    case 'left': // scene top is at buffer left
      x = 1 - v;
      y = u;
      break;
    case 'down':
      x = 1 - u;
      y = 1 - v;
      break;
    default:
      x = u;
      y = v;
  }
  return [mirrored ? 1 - x : x, y];
}

/** Rotate a normalised box from buffer space to upright space. */
export function boxToUpright(b: Box, orientation: FrameOrientation, mirrored = false): Box {
  const [x1, y1] = toUpright(b.x, b.y, orientation, mirrored);
  const [x2, y2] = toUpright(b.x + b.w, b.y + b.h, orientation, mirrored);
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  return { x, y, w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

/** Horizontal angle of the box centre from the optical axis (degrees, negative = left). */
export function angleOf(box: Box): number {
  const cx = box.x + box.w / 2 - 0.5; // -0.5..0.5 of crop width
  return (Math.atan(cx / FOCAL_NORM) * 180) / Math.PI;
}

/** Coarse bearing used in speech: centre third of the view is "front". */
export function bearingOf(angleDeg: number): Bearing {
  if (angleDeg < -PORTRAIT_HFOV_DEG / 6) return 'left';
  if (angleDeg > PORTRAIT_HFOV_DEG / 6) return 'right';
  return 'front';
}

/** 12-hour clock direction; the camera sees roughly 11 to 1 o'clock. */
export function clockOf(angleDeg: number): number {
  const hour = Math.round(angleDeg / 30); // 30 degrees per clock hour
  const c = 12 + hour;
  return c > 12 ? c - 12 : c;
}

/**
 * Pinhole distance estimate from the object's typical real height and its apparent height.
 * Returns null when the object is cut off by the top/bottom edge (height is then meaningless),
 * or its real size is unknown.
 */
export function estimateDistance(box: Box, realHeightM: number | null): number | null {
  if (realHeightM == null || box.h <= 0.01) return null;
  const touchesTop = box.y <= 0.01;
  const touchesBottom = box.y + box.h >= 0.99;
  if (touchesTop && touchesBottom) return null;
  const d = (realHeightM * FOCAL_NORM) / box.h;
  if (touchesTop || touchesBottom) {
    // Partially visible: the real extent is larger than what we see, so the object is at most this far.
    return Math.max(0.3, Math.round(d * 10) / 10);
  }
  return Math.min(30, Math.max(0.3, Math.round(d * 10) / 10));
}

/** "about 1.2 metres" / "about 4 metres" - honest phrasing for an approximate estimate. */
export function spokenDistance(m: number | null): string {
  if (m == null) return '';
  if (m < 1) return 'less than a metre';
  const v = m < 3 ? Math.round(m * 2) / 2 : Math.round(m);
  return `about ${v} ${v === 1 ? 'metre' : 'metres'}`;
}

/** Compact label for pins/cards: "1.2m". */
export function shortDistance(m: number | null): string {
  if (m == null) return '';
  return m < 10 ? `${m.toFixed(1)}m` : `${Math.round(m)}m`;
}

export function bearingWord(b: Bearing): string {
  return b === 'front' ? 'Front' : b === 'left' ? 'Left' : 'Right';
}

export function spokenBearing(b: Bearing): string {
  return b === 'front' ? 'ahead of you' : b === 'left' ? 'on your left' : 'on your right';
}

/**
 * Map a box in the detector's square-crop space to the on-screen viewport.
 * imageAspect = width/height of the upright camera image (portrait 3:4 = 0.75).
 * viewAspect  = width/height of the viewport (Stitch: aspect-[4/3] = 1.333), preview uses "cover".
 */
export function squareToView(b: Box, imageAspect = 0.75, viewAspect = 4 / 3): Box {
  // square crop in image coords: full width, centred vertical span of `imageAspect` of the height
  const sqTop = (1 - imageAspect) / 2;
  const imgY = (y: number) => sqTop + y * imageAspect;
  // viewport shows full width and a centred vertical span of imageAspect/viewAspect of the image height
  const visible = Math.min(1, imageAspect / viewAspect);
  const visTop = (1 - visible) / 2;
  const viewY = (y: number) => (imgY(y) - visTop) / visible;
  const y1 = viewY(b.y);
  const y2 = viewY(b.y + b.h);
  return { x: b.x, y: y1, w: b.w, h: y2 - y1 };
}

export function iou(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union <= 0 ? 0 : inter / union;
}
