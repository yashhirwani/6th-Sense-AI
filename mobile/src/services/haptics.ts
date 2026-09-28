import { Platform, Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';
import { getSettings, type HapticStrength } from '@/state/settings';
import type { Bearing } from './perception/types';

/**
 * Distinct, learnable haptic vocabulary (spec: normal / object / navigation / warning / critical).
 * Android uses explicit vibration patterns (ms on/off) whose length scales with the user's
 * "Haptic Pulse Feedback" strength; iOS maps each cue to Taptic Engine impacts.
 */
export type HapticCue =
  | 'tap' // UI confirmation
  | 'listen' // voice capture started (Stitch orb: [40,60,40])
  | 'object' // target found / object announced
  | 'navigate-left'
  | 'navigate-right'
  | 'navigate-straight'
  | 'arrived'
  | 'warning'
  | 'critical'
  | 'success'
  | 'error';

const PATTERNS: Record<HapticCue, number[]> = {
  tap: [0, 30],
  listen: [0, 40, 60, 40],
  object: [0, 25, 80, 25],
  // "Two short pulses" = turn cue (Stitch Explore haptic bar). Left = two, right = three, straight = one long.
  'navigate-left': [0, 60, 90, 60],
  'navigate-right': [0, 60, 90, 60, 90, 60],
  'navigate-straight': [0, 160],
  arrived: [0, 60, 60, 60, 60, 200],
  warning: [0, 180, 120, 180],
  critical: [0, 400, 120, 400, 120, 400],
  success: [0, 30, 60, 90],
  error: [0, 250, 100, 250],
};

const SCALE: Record<HapticStrength, number> = { gentle: 0.6, crisp: 1, strong: 1.6 };

function scaled(pattern: number[], strength: HapticStrength): number[] {
  const k = SCALE[strength];
  // Only "on" segments (odd indices) scale; gaps keep their rhythm.
  return pattern.map((v, i) => (i % 2 === 1 ? Math.round(v * k) : v));
}

async function iosCue(cue: HapticCue, strength: HapticStrength) {
  const heavy = strength === 'strong';
  const style = strength === 'gentle' ? Haptics.ImpactFeedbackStyle.Light : heavy ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium;
  const pulses = (n: number, gap = 110, s = style) =>
    Array.from({ length: n }).reduce<Promise<void>>(
      (p, _, i) => p.then(() => (i ? new Promise((r) => setTimeout(r, gap)) : undefined)).then(() => Haptics.impactAsync(s)),
      Promise.resolve(),
    );
  switch (cue) {
    case 'warning':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    case 'critical':
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return pulses(3, 150, Haptics.ImpactFeedbackStyle.Heavy);
    case 'success':
    case 'arrived':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    case 'error':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    case 'navigate-left':
    case 'listen':
    case 'object':
      return pulses(2);
    case 'navigate-right':
      return pulses(3);
    case 'navigate-straight':
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
    default:
      return Haptics.selectionAsync();
  }
}

export function haptic(cue: HapticCue, strengthOverride?: HapticStrength) {
  const strength = strengthOverride ?? getSettings().hapticStrength;
  try {
    if (Platform.OS === 'android') {
      Vibration.vibrate(scaled(PATTERNS[cue], strength));
    } else if (Platform.OS === 'ios') {
      void iosCue(cue, strength);
    }
  } catch {
    // Haptics are a supplement to speech; never let a failure break the flow.
  }
}

export function hapticForBearing(b: Bearing): HapticCue {
  return b === 'left' ? 'navigate-left' : b === 'right' ? 'navigate-right' : 'navigate-straight';
}

export function stopHaptics() {
  Vibration.cancel();
}

export const HAPTIC_PATTERNS = PATTERNS;
export const scalePattern = scaled;
