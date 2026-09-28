import { useEffect, type ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/**
 * Stitch animation utilities (animate-ping / animate-pulse / animate-spin) rebuilt with Reanimated.
 * All of them respect the OS "reduce motion" setting.
 */

/** Tailwind `animate-pulse`: opacity 1 -> 0.5 -> 1 over 2s. */
export function Pulse({ children, style, className }: { children?: ReactNode; style?: ViewStyle; className?: string }) {
  const reduced = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    o.value = withRepeat(withSequence(withTiming(0.5, { duration: 1000 }), withTiming(1, { duration: 1000 })), -1);
    return () => cancelAnimation(o);
  }, [reduced, o]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View style={[style, a]} className={className}>
      {children}
    </Animated.View>
  );
}

/** Tailwind `animate-ping`: a halo that scales to 2x and fades out, behind the child dot. */
export function Ping({ className, size = 8, duration = 1000, style }: { className?: string; size?: number; duration?: number; style?: ViewStyle }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.value = withRepeat(withTiming(1, { duration, easing: Easing.bezier(0, 0, 0.2, 1) }), -1);
    return () => cancelAnimation(t);
  }, [reduced, t, duration]);
  const halo = useAnimatedStyle(() => ({ transform: [{ scale: 1 + t.value }], opacity: 0.75 * (1 - t.value) }));
  return (
    <View style={[{ width: size, height: size }, style]}>
      {!reduced && <Animated.View className={className} style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2 }, halo]} />}
      <View className={className} style={{ width: size, height: size, borderRadius: size / 2 }} />
    </View>
  );
}

/** Tailwind `animate-spin` with a custom duration (Stitch orb rings: 24s). */
export function Spin({ children, duration = 1000, style }: { children: ReactNode; duration?: number; style?: ViewStyle }) {
  const reduced = useReducedMotion();
  const r = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    r.value = withRepeat(withTiming(360, { duration, easing: Easing.linear }), -1);
    return () => cancelAnimation(r);
  }, [reduced, r, duration]);
  const a = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

/** Large expanding halo used behind the voice orb (animate-ping, 3s, opacity-35). */
export function Halo({ className, active = true, duration = 3000 }: { className?: string; active?: boolean; duration?: number }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced || !active) {
      t.value = 0;
      return;
    }
    t.value = withRepeat(withTiming(1, { duration, easing: Easing.bezier(0, 0, 0.2, 1) }), -1);
    return () => cancelAnimation(t);
  }, [reduced, active, t, duration]);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: 1 + t.value * 0.35 }], opacity: 0.35 * (1 - t.value) }));
  return <Animated.View pointerEvents="none" className={className} style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }, a]} />;
}
