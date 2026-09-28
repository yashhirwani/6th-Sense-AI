import type { RawDetection } from './types';

/** YOLO11n TFLite export (tools/export_yolo_tflite.py): NHWC float32 RGB 0..1 in, [1,300,6] out. */
export const MODEL_INPUT = 320;
export const MIN_SCORE = 0.4;
export const MAX_DETECTIONS = 25;

/**
 * Decode the NMS-embedded YOLO output: rows of x1, y1, x2, y2 (input pixels), score, classId.
 * Returns boxes normalised to 0..1 in the (not yet rotated) buffer orientation.
 * Marked as a worklet so it can run on the camera's frame thread.
 */
export function decodeYolo(out: Float32Array, minScore = MIN_SCORE, size = MODEL_INPUT): RawDetection[] {
  'worklet';
  const res: RawDetection[] = [];
  const rows = Math.floor(out.length / 6);
  for (let i = 0; i < rows; i++) {
    const o = i * 6;
    const score = out[o + 4];
    if (score < minScore) continue;
    const x1 = Math.max(0, out[o] / size);
    const y1 = Math.max(0, out[o + 1] / size);
    const x2 = Math.min(1, out[o + 2] / size);
    const y2 = Math.min(1, out[o + 3] / size);
    if (x2 <= x1 || y2 <= y1) continue;
    res.push({ classId: Math.round(out[o + 5]), score, box: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } });
    if (res.length >= MAX_DETECTIONS) break;
  }
  return res;
}
