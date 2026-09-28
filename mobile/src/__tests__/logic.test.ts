import { describeLocally, joinList } from '@/services/assistant/localDescribe';
import { SentenceStreamer } from '@/services/assistant/sentences';
import { FallDetector } from '@/services/emergency/fallDetector';
import type { Detection } from '@/services/perception/types';
import { parseSse } from '@/services/api/sse';

describe('SentenceStreamer', () => {
  it('emits complete sentences as they stream in', () => {
    const s = new SentenceStreamer();
    expect(s.push('You are in a class')).toEqual([]);
    expect(s.push('room. There are about 18 ')).toEqual(['You are in a classroom.']);
    expect(s.push('people. A chair is 1.5 metres ahead')).toEqual(['There are about 18 people.']);
    expect(s.flush()).toBe('A chair is 1.5 metres ahead');
  });
  it('does not split abbreviations or decimals', () => {
    const s = new SentenceStreamer();
    expect(s.push('Call Dr. Sarah now. Next')).toEqual(['Call Dr. Sarah now.']);
  });
  it('handles the Devanagari danda', () => {
    const s = new SentenceStreamer();
    expect(s.push('सामने एक कुर्सी है। ')).toEqual(['सामने एक कुर्सी है।']);
  });
});

describe('FallDetector', () => {
  const run = (samples: [number, number][]) => {
    const d = new FallDetector();
    let ev = null;
    for (const [g, t] of samples) ev = d.push(0, 0, g, t) ?? ev;
    return ev;
  };
  const series = (from: number, to: number, g: number, step = 20): [number, number][] => {
    const out: [number, number][] = [];
    for (let t = from; t < to; t += step) out.push([g, t]);
    return out;
  };

  it('detects free fall + impact + stillness', () => {
    const ev = run([...series(0, 500, 1), ...series(500, 700, 0.1), [3.5, 700], ...series(720, 1300, 1.6), ...series(1300, 5000, 1.0)]);
    expect(ev).toEqual({ type: 'fall', impactG: 3.5 });
  });
  it('ignores a drop where the phone is picked up again', () => {
    const ev = run([...series(0, 500, 1), ...series(500, 700, 0.1), [3.5, 700], ...series(720, 1500, 1.0), ...series(1500, 5000, 1.8)]);
    expect(ev).toBeNull();
  });
  it('ignores jogging-like spikes without free fall', () => {
    const samples: [number, number][] = [];
    for (let t = 0; t < 5000; t += 20) samples.push([t % 400 < 60 ? 2.6 : 0.8, t]);
    expect(run(samples)).toBeNull();
  });
});

describe('describeLocally', () => {
  const d = (p: Partial<Detection>): Detection => ({
    id: Math.random(),
    label: 'person',
    name: 'person',
    icon: 'person',
    confidence: 0.9,
    box: { x: 0.4, y: 0.3, w: 0.2, h: 0.4 },
    bearing: 'front',
    angleDeg: 0,
    clock: 12,
    distanceM: 2,
    approachRate: 0,
    age: 4,
    ...p,
  });
  it('summarises counts and positions and states it is on-device', () => {
    const text = describeLocally([d({}), d({ bearing: 'right', distanceM: 3 }), d({ label: 'chair', name: 'chair', distanceM: 1.2 })]);
    expect(text).toMatch(/I can see two people and one chair\./);
    expect(text).toMatch(/A chair is about 1 metre ahead of you\./);
    expect(text).toMatch(/On-device detection only/);
  });
  it('is honest when nothing is detected', () => {
    expect(describeLocally([])).toMatch(/don't recognise any objects/);
  });
  it('joins lists naturally', () => {
    expect(joinList(['a', 'b', 'c'])).toBe('a, b and c');
  });
});

describe('parseSse', () => {
  it('parses event and data lines', () => {
    expect(parseSse('event: delta\ndata: {"text":"Hi"}')).toEqual({ event: 'delta', data: '{"text":"Hi"}' });
    expect(parseSse(': keep-alive')).toBeNull();
  });
});
