/**
 * Loud two-tone siren synthesized with Web Audio (react-native-audio-api) so no audio asset is needed.
 * Paired with the on-screen strobe in the Safety screen.
 */
class Siren {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ctx: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private osc: any = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private on = false;

  isOn() {
    return this.on;
  }

  toggle(): boolean {
    if (this.on) this.stop();
    else this.start();
    return this.on;
  }

  start() {
    try {
      if (!this.ctx) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { AudioContext } = require('react-native-audio-api');
        this.ctx = new AudioContext();
      }
      const ctx = this.ctx;
      const gain = ctx.createGain();
      gain.gain.value = 1.0;
      gain.connect(ctx.destination);
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 880;
      osc.connect(gain);
      osc.start();
      this.osc = osc;
      let high = false;
      this.timer = setInterval(() => {
        high = !high;
        osc.frequency.setValueAtTime(high ? 1320 : 880, ctx.currentTime);
      }, 450);
      this.on = true;
    } catch (e) {
      if (__DEV__) console.warn('[siren] unavailable', e);
      this.on = false;
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    try {
      this.osc?.stop();
    } catch {
      /* already stopped */
    }
    this.osc = null;
    this.on = false;
  }
}

export const siren = new Siren();
