import { decodeYolo, MODEL_INPUT } from '@/services/perception/decode';
import { angleOf, bearingOf, boxToUpright, clockOf, estimateDistance, iou, spokenDistance, squareToView, toUpright } from '@/services/perception/geometry';
import { evaluateHazards, isPathClear } from '@/services/perception/hazards';
import { classIdForName, COCO_LABELS } from '@/services/perception/labels';
import { Tracker } from '@/services/perception/tracker';
import type { Detection } from '@/services/perception/types';

const det = (p: Partial<Detection>): Detection => ({
  id: 1,
  label: 'chair',
  name: 'chair',
  icon: 'chair',
  confidence: 0.9,
  box: { x: 0.4, y: 0.4, w: 0.2, h: 0.3 },
  bearing: 'front',
  angleDeg: 0,
  clock: 12,
  distanceM: 1.2,
  approachRate: 0,
  age: 5,
  ...p,
});

describe('labels', () => {
  it('has the 80 COCO classes in Ultralytics order', () => {
    expect(COCO_LABELS).toHaveLength(80);
    expect(COCO_LABELS[0].label).toBe('person');
    expect(COCO_LABELS[5].label).toBe('bus');
    expect(COCO_LABELS[56].label).toBe('chair');
    expect(COCO_LABELS[79].label).toBe('toothbrush');
  });
  it('resolves spoken aliases', () => {
    expect(COCO_LABELS[classIdForName('my phone')!].label).toBe('cell phone');
    expect(COCO_LABELS[classIdForName('chairs')!].label).toBe('chair');
    expect(classIdForName('wallet')).toBeNull();
  });
});

describe('decodeYolo', () => {
  it('decodes NMS rows (pixels -> normalised) and drops low scores', () => {
    const out = new Float32Array(300 * 6);
    out.set([32, 64, 160, 320, 0.9, 5], 0); // bus
    out.set([0, 0, 10, 10, 0.2, 0], 6); // below threshold
    const d = decodeYolo(out);
    expect(d).toHaveLength(1);
    expect(d[0].classId).toBe(5);
    expect(d[0].box.x).toBeCloseTo(32 / MODEL_INPUT);
    expect(d[0].box.w).toBeCloseTo(128 / MODEL_INPUT);
    expect(d[0].box.h).toBeCloseTo(256 / MODEL_INPUT);
  });
});

describe('geometry', () => {
  it('rotates buffer coordinates to upright', () => {
    expect(toUpright(0.2, 0.3, 'up')).toEqual([0.2, 0.3]);
    expect(toUpright(0, 0, 'down')).toEqual([1, 1]);
    // a box on the right edge of a sensor frame rotated +90 is at the top of the upright image
    const b = boxToUpright({ x: 0.8, y: 0.4, w: 0.2, h: 0.2 }, 'right');
    expect(b.y).toBeCloseTo(0);
    expect(b.x).toBeCloseTo(0.4);
  });
  it('computes bearing and clock from horizontal position', () => {
    const left = angleOf({ x: 0, y: 0.4, w: 0.1, h: 0.2 });
    const right = angleOf({ x: 0.9, y: 0.4, w: 0.1, h: 0.2 });
    expect(bearingOf(left)).toBe('left');
    expect(bearingOf(right)).toBe('right');
    expect(bearingOf(angleOf({ x: 0.45, y: 0, w: 0.1, h: 0.1 }))).toBe('front');
    expect(clockOf(0)).toBe(12);
    expect(clockOf(-30)).toBe(11);
    expect(clockOf(30)).toBe(1);
  });
  it('estimates distance with a pinhole model and refuses cut-off objects', () => {
    // a 1.7 m person filling ~50% of the frame height is roughly 3.3 m away with a 54 deg FOV
    const d = estimateDistance({ x: 0.4, y: 0.25, w: 0.2, h: 0.5 }, 1.7)!;
    expect(d).toBeGreaterThan(2.8);
    expect(d).toBeLessThan(3.8);
    expect(estimateDistance({ x: 0, y: 0, w: 1, h: 1 }, 1.7)).toBeNull();
    expect(estimateDistance({ x: 0, y: 0.2, w: 0.2, h: 0.2 }, null)).toBeNull();
  });
  it('phrases distances honestly', () => {
    expect(spokenDistance(0.6)).toBe('less than a metre');
    expect(spokenDistance(1.2)).toBe('about 1 metre');
    expect(spokenDistance(4.2)).toBe('about 4 metres');
  });
  it('maps the square crop into the 4:3 viewport', () => {
    const v = squareToView({ x: 0, y: 0.5, w: 1, h: 0 });
    expect(v.y).toBeCloseTo(0.5);
  });
  it('computes IoU', () => {
    expect(iou({ x: 0, y: 0, w: 1, h: 1 }, { x: 0, y: 0, w: 1, h: 1 })).toBeCloseTo(1);
    expect(iou({ x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 })).toBe(0);
  });
});

describe('Tracker', () => {
  it('keeps ids stable and reports only after 2 frames', () => {
    const t = new Tracker();
    const raw = [{ classId: 56, score: 0.8, box: { x: 0.4, y: 0.4, w: 0.2, h: 0.3 } }];
    expect(t.update(raw, 0)).toHaveLength(0);
    const second = t.update(raw, 150);
    expect(second).toHaveLength(1);
    const third = t.update([{ classId: 56, score: 0.8, box: { x: 0.41, y: 0.4, w: 0.2, h: 0.3 } }], 300);
    expect(third[0].id).toBe(second[0].id);
  });
  it('measures approach from box growth', () => {
    const t = new Tracker();
    let out: Detection[] = [];
    for (let i = 0; i < 6; i++) {
      const h = 0.2 + i * 0.05;
      out = t.update([{ classId: 2, score: 0.9, box: { x: 0.4, y: 0.5 - h / 2, w: 0.2, h } }], i * 200);
    }
    expect(out[0].approachRate).toBeGreaterThan(0.25);
  });
});

describe('hazards', () => {
  it('flags an approaching car as critical with a spoken directive', () => {
    const [h] = evaluateHazards([det({ label: 'car', name: 'car', distanceM: 4, approachRate: 0.6, bearing: 'left' })]);
    expect(h.severity).toBe('critical');
    expect(h.message).toMatch(/^Stop\. Car approaching/);
    expect(h.message).toMatch(/on your left/);
  });
  it('warns about a close obstacle in the walking path only', () => {
    expect(evaluateHazards([det({ distanceM: 0.6 })])[0].severity).toBe('warning');
    expect(evaluateHazards([det({ distanceM: 0.6, bearing: 'left' })])).toHaveLength(0);
  });
  it('ignores ordinary objects', () => {
    expect(evaluateHazards([det({ label: 'cup', name: 'cup' })])).toHaveLength(0);
  });
  it('orders by severity', () => {
    const hs = evaluateHazards([det({ distanceM: 1.2 }), det({ id: 2, label: 'bus', name: 'bus', distanceM: 2 })]);
    expect(hs[0].label).toBe('bus');
  });
  it('reports a clear path', () => {
    expect(isPathClear([det({ distanceM: 5 })])).toBe(true);
    expect(isPathClear([det({ distanceM: 1 })])).toBe(false);
  });
});
