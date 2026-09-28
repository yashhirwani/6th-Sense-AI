import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './icons/Icon';
import { Logo } from './Logo';
import { Pulse } from './motion';
import { haptic } from '@/services/haptics';
import { useAssistant } from '@/state/assistant';
import { useSettings } from '@/state/settings';

/**
 * Stitch shared header: logo, "6th Sense AI • <Screen>", live status line, contrast toggle, profile.
 * The status line reflects REAL state (server reachability, spatial audio setting) instead of the
 * mock "Online • Spatial Audio On".
 */
export function AppHeader({ title }: { title: string }) {
  const insets = useSafeAreaInsets();
  const online = useAssistant((s) => s.backendOnline);
  const spatial = useSettings((s) => s.spatialAudio);
  const highContrast = useSettings((s) => s.highContrast);
  const update = useSettings((s) => s.update);

  const connection = online === null ? 'Connecting…' : online ? 'Online' : 'Offline • On-device';
  const status = `${connection} • Spatial Audio ${spatial ? 'On' : 'Off'}`;

  return (
    <View className="bg-surface z-50" style={{ paddingTop: insets.top, boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
      <View className="h-20 px-margin flex-row items-center justify-between gap-space-sm">
        <View className="flex-row items-center gap-space-sm min-w-0 flex-1">
          <Logo size={32} />
          <View className="flex-col min-w-0 flex-1">
            <View className="flex-row items-center gap-space-xs min-w-0" accessible accessibilityRole="header">
              <Text numberOfLines={1} className="font-headline-sm text-headline-sm text-on-surface flex-shrink">
                6th Sense AI
              </Text>
              <Text className="text-outline font-label-sm text-label-sm">•</Text>
              <Text numberOfLines={1} className="font-label-md text-label-md text-primary flex-shrink">
                {title}
              </Text>
            </View>
            <View className="flex-row items-center gap-1.5 mt-0.5" accessibilityLiveRegion="polite" accessibilityRole="text">
              <Pulse className={`w-2 h-2 rounded-full ${online === false ? 'bg-tertiary' : 'bg-secondary'}`} />
              <Text numberOfLines={1} className="font-label-sm text-label-sm text-on-surface-variant font-medium tracking-wide flex-shrink">
                {status}
              </Text>
            </View>
          </View>
        </View>
        <View className="flex-row items-center gap-space-xs flex-shrink-0">
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: highContrast }}
            accessibilityLabel="Toggle high contrast display mode"
            onPress={() => {
              haptic('tap');
              update({ highContrast: !highContrast });
            }}
            className="min-w-[44px] min-h-[44px] w-11 h-11 items-center justify-center rounded-lg bg-surface-container active:bg-surface-container-high"
          >
            <Icon name="contrast" size={24} className="text-on-surface" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Account profile and voice preferences"
            onPress={() => router.push('/settings')}
            className="min-w-[44px] min-h-[44px] w-11 h-11 items-center justify-center rounded-full active:opacity-90"
          >
            <View className="w-8 h-8 rounded-full bg-primary-fixed items-center justify-center">
              <Icon name="person" size={20} filled className="text-on-primary-fixed" />
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
