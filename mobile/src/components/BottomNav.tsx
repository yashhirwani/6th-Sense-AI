import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './icons/Icon';
import { assistant } from '@/services/assistant/assistant';
import { haptic } from '@/services/haptics';
import { useAssistant } from '@/state/assistant';

type TabDef = { route: string; label: string; icon: string; a11y: string };

/** Stitch "Global sensory navigation" - order and labels exactly as designed. */
const LEFT: TabDef[] = [
  { route: 'index', label: 'Home', icon: 'home', a11y: 'Home sensory assistant feed' },
  { route: 'explore', label: 'Explore', icon: 'travel_explore', a11y: 'Explore surroundings and scene description' },
];
const RIGHT: TabDef[] = [
  { route: 'scan', label: 'Scan', icon: 'document_scanner', a11y: 'Optical scanner for text, medication labels, and barcodes' },
  { route: 'safety', label: 'Safety', icon: 'shield', a11y: 'Safety alerts, spatial hazard detection, and SOS' },
];

type Props = {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void; emit: (e: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean } };
};

export function BottomNav({ state, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const status = useAssistant((s) => s.status);
  const current = state.routes[state.index]?.name;

  const tab = (t: TabDef) => {
    const active = current === t.route;
    const route = state.routes.find((r) => r.name === t.route);
    return (
      <Pressable
        key={t.route}
        accessibilityRole="tab"
        accessibilityLabel={t.a11y}
        accessibilityState={{ selected: active }}
        onPress={() => {
          if (!route) return;
          const ev = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!active && !ev.defaultPrevented) {
            haptic('tap');
            navigation.navigate(t.route);
          }
        }}
        className="flex-col items-center justify-center min-w-[56px] min-h-[56px] p-1 rounded-lg"
      >
        <Icon name={t.icon} size={26} className={active ? 'text-primary' : 'text-on-surface-variant'} />
        <Text className={`font-label-sm text-label-sm mt-0.5 ${active ? 'text-primary font-bold' : 'text-on-surface-variant'}`}>{t.label}</Text>
      </Pressable>
    );
  };

  const listening = status === 'listening';
  return (
    <View
      accessibilityLabel="Global sensory navigation"
      className="bg-surface"
      style={{ paddingBottom: insets.bottom, boxShadow: '0 -2px 12px rgba(0,0,0,0.06)' }}
    >
      <View className="flex-row items-center justify-around h-20 px-space-xs">
        {LEFT.map(tab)}
        <View className="flex-col items-center justify-center" style={{ top: -20 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={listening ? 'Stop listening' : 'Activate Instant One-Tap Voice and Iris Multimodal Dictation'}
            accessibilityHint="Ask a question about what the camera sees"
            onPress={() => assistant.toggleVoice()}
            className="min-w-[64px] min-h-[64px] w-16 h-16 rounded-full bg-primary items-center justify-center active:scale-95"
            style={{ boxShadow: '0 4px 16px rgba(169,49,25,0.35)' }}
          >
            <Icon name={listening ? 'graphic_eq' : 'mic'} size={32} className="text-on-primary" />
          </Pressable>
          <Text className="font-label-sm text-label-sm text-on-surface font-bold mt-1 tracking-tight">Ask AI</Text>
        </View>
        {RIGHT.map(tab)}
      </View>
    </View>
  );
}
