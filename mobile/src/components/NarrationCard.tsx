import { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { Icon } from './icons/Icon';
import { tts } from '@/services/audio/tts';
import { haptic } from '@/services/haptics';
import { useAssistant } from '@/state/assistant';

function useLastNarration() {
  return useSyncExternalStore(
    (cb) => tts.onChange(cb),
    () => tts.lastNarration,
  );
}

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

const agoLabel = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
};

/** "Live Sensory Speech Bubble & Audio Replay Card". Shows what was actually spoken last. */
export function NarrationCard() {
  const last = useLastNarration();
  const status = useAssistant((s) => s.status);
  const partial = useAssistant((s) => s.partialTranscript);
  const now = useNow();

  const listening = status === 'listening';
  const body = listening
    ? partial
      ? `“${partial}”`
      : 'Listening…'
    : last
      ? `“${last.text}”`
      : 'Tap the orb to hear a description of what is in front of you, or hold it to ask a question.';

  return (
    <View accessibilityLiveRegion="polite" className="flex-col bg-surface-container-lowest rounded-xl p-space-md shadow-sm gap-space-sm">
      <View className="flex-row items-start gap-space-sm">
        <View className="w-10 h-10 rounded-full bg-primary-fixed items-center justify-center">
          <Icon name={listening ? 'mic' : 'spatial_audio'} size={22} className="text-on-primary-fixed" />
        </View>
        <View className="flex-col min-w-0 flex-1">
          <Text className="font-label-sm text-label-sm text-primary uppercase tracking-wider">{listening ? 'You said' : 'Audio Narration'}</Text>
          <Text className="font-body-md text-body-md text-on-surface mt-0.5 font-normal">{body}</Text>
        </View>
      </View>
      <View className="flex-row items-center justify-between gap-space-sm bg-surface-container-low px-space-sm py-2 rounded-lg">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={last ? `Replay audio announcement spoken ${agoLabel(now - last.at)}` : 'Nothing to replay yet'}
          accessibilityState={{ disabled: !last }}
          disabled={!last}
          onPress={() => {
            haptic('tap');
            tts.replayLast();
          }}
          className={`flex-row items-center gap-2 min-h-[44px] px-3 rounded-lg bg-surface-container-lowest shadow-sm active:bg-primary-fixed ${last ? '' : 'opacity-50'}`}
        >
          <Icon name="play_circle" size={22} filled className="text-primary" />
          <Text className="font-label-md text-label-md text-on-surface">{last ? `Replay (${agoLabel(now - last.at)})` : 'Replay'}</Text>
        </Pressable>
        <Waveform active={status === 'speaking' || listening} />
      </View>
    </View>
  );
}

const BAR_HEIGHTS = [12, 20, 8, 24, 16, 8, 20];

/** Decorative waveform from the Stitch card; animates while audio is actually playing or recording. */
function Waveform({ active }: { active: boolean }) {
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" className="flex-row items-center gap-1 h-6 px-2">
      {BAR_HEIGHTS.map((h, i) => (
        <Bar key={i} height={h} active={active} delay={i * 90} />
      ))}
    </View>
  );
}

function Bar({ height, active, delay }: { height: number; active: boolean; delay: number }) {
  const reduced = useReducedMotion();
  const s = useSharedValue(1);
  useEffect(() => {
    if (!active || reduced) {
      s.value = withTiming(1);
      return;
    }
    const t = setTimeout(() => {
      s.value = withRepeat(withSequence(withTiming(0.4, { duration: 260 }), withTiming(1, { duration: 260 })), -1);
    }, delay);
    return () => clearTimeout(t);
  }, [active, reduced, s, delay]);
  const a = useAnimatedStyle(() => ({ transform: [{ scaleY: s.value }] }));
  return <Animated.View className="w-1 bg-primary rounded-full" style={[{ height }, a]} />;
}
