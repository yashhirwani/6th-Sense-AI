import { Redirect, Tabs } from 'expo-router';
import { BottomNav } from '@/components/BottomNav';
import { useSettings } from '@/state/settings';

export default function TabsLayout() {
  const onboarded = useSettings((s) => s.onboarded);
  if (!onboarded) return <Redirect href="/onboarding" />;
  return (
    <Tabs
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tabBar={(props) => <BottomNav {...(props as any)} />}
      screenOptions={{ headerShown: false, lazy: true }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="explore" options={{ title: 'Explore' }} />
      <Tabs.Screen name="scan" options={{ title: 'Scan' }} />
      <Tabs.Screen name="safety" options={{ title: 'Safety' }} />
    </Tabs>
  );
}
