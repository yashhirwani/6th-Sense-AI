import '../../global.css';
import '@/theme/textScale';
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { assistant } from '@/services/assistant/assistant';
import { emergency } from '@/services/emergency/emergency';
import { useSettings, useSettingsHydrated } from '@/state/settings';
import { ThemeProvider, useTheme } from '@/theme';
import { useTextScale } from '@/theme/textScale';
import { loadWebFonts } from '@/theme/webFonts';
import { initLocalDb } from '@/db/local';

function Root() {
  useTextScale();
  const { dark, colors } = useTheme();
  const fallDetection = useSettings((s) => s.fallDetection);

  useEffect(() => {
    assistant.init();
  }, []);

  useEffect(() => {
    if (fallDetection) emergency.startMonitoring();
    else emergency.stopMonitoring();
  }, [fallDetection]);

  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface }, animation: 'fade' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="settings" />
      </Stack>
    </>
  );
}

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const hydrated = useSettingsHydrated();
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    void Promise.all([loadWebFonts(), initLocalDb()]).finally(() => setFontsReady(true));
  }, []);
  useEffect(() => {
    if (hydrated && fontsReady) SplashScreen.hideAsync().catch(() => undefined);
  }, [hydrated, fontsReady]);
  if (!hydrated || !fontsReady) return null;
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Root />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
