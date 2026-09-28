/**
 * Fall detection from the phone accelerometer (values in g). Classic three-phase heuristic:
 *   1. free fall   - total acceleration drops well below 1 g,
 *   2. impact      - a spike above IMPACT_G shortly after,
 *   3. stillness   - little movement for STILL_MS after the impact (the person is not getting up).
 * Only (1)+(2)+(3) together raise a "possible fall" - a dropped phone that is picked up again, or
 * jogging, should not trigger. It is a heuristic: the countdown + cancel exists because false positives
 * are possible, and falls without free fall (slumping) can be missed.
 */
export const FALL_CONFIG = {
  FREE_FALL_G: 0.4,
  FREE_FALL_MIN_MS: 60,
  IMPACT_G: 2.3,
  IMPACT_WINDOW_MS: 1000,
  STILL_MS: 2500,
  STILL_TOLERANCE_G: 0.25,
  /** Allowed "unsettled" time right after impact (bounce) before stillness is judged. */
  SETTLE_MS: 700,
};

type Phase = 'idle' | 'falling' | 'awaitImpact' | 'awaitStill';

export class FallDetector {
  private phase: Phase = 'idle';
  private since = 0;
  private impactAt = 0;
  private peak = 0;

  constructor(private readonly cfg = FALL_CONFIG) {}

  /** Feed one sample; returns an event when a possible fall is confirmed. */
  push(x: number, y: number, z: number, t: number): { type: 'fall'; impactG: number } | null {
    const g = Math.sqrt(x * x + y * y + z * z);
    const c = this.cfg;
    switch (this.phase) {
      case 'idle':
        if (g < c.FREE_FALL_G) {
          this.phase = 'falling';
          this.since = t;
        }
        return null;
      case 'falling':
        if (g < c.FREE_FALL_G) return null;
        if (t - this.since >= c.FREE_FALL_MIN_MS) {
          this.phase = 'awaitImpact';
          this.since = t;
          return this.push(x, y, z, t); // the sample ending free fall may itself be the impact
        }
        this.phase = 'idle';
        return null;
      case 'awaitImpact':
        if (g >= c.IMPACT_G) {
          this.phase = 'awaitStill';
          this.impactAt = t;
          this.peak = g;
          return null;
        }
        if (t - this.since > c.IMPACT_WINDOW_MS) this.phase = 'idle';
        return null;
      case 'awaitStill': {
        const dt = t - this.impactAt;
        if (dt < c.SETTLE_MS) {
          this.peak = Math.max(this.peak, g);
          return null;
        }
        if (Math.abs(g - 1) > c.STILL_TOLERANCE_G) {
          // Moving again (picked the phone up / walked on) - not a fall.
          this.phase = 'idle';
          return null;
        }
        if (dt >= c.SETTLE_MS + c.STILL_MS) {
          this.phase = 'idle';
          return { type: 'fall', impactG: Math.round(this.peak * 10) / 10 };
        }
        return null;
      }
    }
  }

  reset() {
    this.phase = 'idle';
  }
}
