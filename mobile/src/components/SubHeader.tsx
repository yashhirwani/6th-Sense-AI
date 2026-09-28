import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './icons/Icon';

/** Secondary-page header in the Stitch header style (h-20, surface, soft shadow) with a back button. */
export function SubHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View className="bg-surface" style={{ paddingTop: insets.top, boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
      <View className="h-20 px-margin flex-row items-center gap-space-sm">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          className="w-11 h-11 rounded-lg bg-surface-container items-center justify-center active:bg-surface-container-high"
        >
          <Icon name="arrow_back" size={24} className="text-on-surface" />
        </Pressable>
        <View className="flex-1 min-w-0">
          <Text accessibilityRole="header" numberOfLines={1} className="font-headline-sm text-headline-sm text-on-surface">
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} className="font-label-sm text-label-sm text-on-surface-variant">
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}
