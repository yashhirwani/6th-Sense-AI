import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { Icon } from './icons/Icon';
import { Halo, Spin } from './motion';
import { assistant } from '@/services/assistant/assistant';
import { stopListening, useMicLevel } from '@/services/audio/stt';
import { haptic } from '@/services/haptics';
import { useAssistant, type AssistantStatus } from '@/state/assistant';
import { useTheme } from '@/theme';

const ORB_LABEL: Record<AssistantStatus, string> = {
  idle: 'Tap or Speak',
  listening: 'Listening…',
  processing: 'Thinking…',
  speaking: 'Speaking',
  error: 'Tap to retry',
};

/**
 * "Large Central Tactile AI Action Zone". Per the Stitch aria-label:
 *   tap            -> instant room description
 *   press and hold -> speak (push-to-talk; release to finish)
 */
export function VoiceOrb() {
  const status = useAssistant((s) => s.status);
  const level = useMicLevel((s) => s.level);
  const { colors } = useTheme();

  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withTiming(status === 'listening' ? 1 + level * 0.12 : 1, { duration: 120 }) }],
  }));

  return (
    <View className="flex-col items-center justify-center py-4" accessibilityLabel="Primary Voice AI Trigger">
      <View className="items-center justify-center w-52 h-52">
        <Halo className="rounded-full bg-primary/10" active={status !== 'idle'} />
        <View pointerEvents="none" className="absolute rounded-full items-center justify-center" style={{ left: 12, right: 12, top: 12, bottom: 12, backgroundColor: `${colors['primary-fixed-dim']}33` }}>
          <Spin duration={24000} style={{ width: '100%', height: '100%' }}>
            <Svg width="100%" height="100%" viewBox="0 0 100 100" fill="none">
              <Circle cx={50} cy={50} r={46} stroke={colors.primary} strokeOpacity={0.4} strokeDasharray="6 8" strokeLinecap="round" strokeWidth={2.5} />
              <Circle cx={50} cy={50} r={38} stroke={colors.primary} strokeOpacity={0.4} strokeDasharray="4 6" strokeLinecap="round" strokeWidth={2} />
            </Svg>
          </Spin>
        </View>
        <Animated.View style={orbStyle}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Press and speak, or tap for instant room description"
            accessibilityHint="Tap to describe the scene. Double tap and hold to ask a question."
            accessibilityState={{ busy: status === 'processing' }}
            accessibilityActions={[{ name: 'activate' }, { name: 'longpress' }, { name: 'ask', label: 'Ask a question' }]}
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === 'ask' || e.nativeEvent.actionName === 'longpress') assistant.toggleVoice();
              else assistant.quick('describe');
            }}
            onPress={() => {
              if (status === 'listening') return stopListening();
              if (status === 'processing' || status === 'speaking') return assistant.cancel();
              haptic('listen');
              assistant.quick('describe');
            }}
            onLongPress={() => assistant.toggleVoice()}
            onPressOut={() => {
              if (useAssistant.getState().status === 'listening') stopListening();
            }}
            delayLongPress={350}
            className="w-32 h-32 rounded-full bg-primary items-center justify-center shadow-xl active:scale-95"
          >
            <Icon name={status === 'listening' ? 'mic' : 'graphic_eq'} size={44} className="text-on-primary" />
            <Text className="font-label-sm text-label-sm mt-1 text-center font-bold px-2 tracking-tight text-on-primary">{ORB_LABEL[status]}</Text>
          </Pressable>
        </Animated.View>
      </View>
      <View className="items-center mt-2">
        <Text className="font-label-md text-label-md text-on-surface font-semibold text-center">Say “Describe scene” or “Find door”</Text>
        <Text className="font-body-sm text-body-sm text-on-surface-variant text-center">Tap orb to describe • hold to ask</Text>
      </View>
      <StatePill status={status} />
    </View>
  );
}

/** The Stitch "Listening / Processing / Speaking" switcher, now a live read-only state indicator. */
function StatePill({ status }: { status: AssistantStatus }) {
  const states: { key: AssistantStatus; label: string }[] = [
    { key: 'listening', label: 'Listening' },
    { key: 'processing', label: 'Processing' },
    { key: 'speaking', label: 'Speaking' },
  ];
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`Assistant state: ${status === 'idle' ? 'ready' : status}`}
      accessibilityLiveRegion="polite"
      className="mt-4 flex-row p-1 rounded-full bg-surface-container-high"
    >
      {states.map((s) => {
        const on = s.key === status;
        return (
          <View key={s.key} className={`px-3 py-1.5 rounded-full ${on ? 'bg-surface-container-lowest shadow-sm' : ''}`}>
            <Text className={`font-label-sm text-label-sm ${on ? 'text-primary font-bold' : 'text-on-surface-variant font-medium'}`}>{s.label}</Text>
          </View>
        );
      })}
    </View>
  );
}
