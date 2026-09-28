import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import Storage from 'expo-sqlite/kv-store';

export type SpeechRate = 1 | 1.25 | 1.5;
export type HapticStrength = 'gentle' | 'crisp' | 'strong';
export type TextScale = 'default' | 'large' | 'xl';
export type Language = 'en' | 'hi';

export type Settings = {
  onboarded: boolean;
  /** Onboarding "Speech Narration Speed" (Stitch default: 1.25x Brisk). */
  speechRate: SpeechRate;
  /** Onboarding "Haptic Pulse Feedback" (Stitch default: Crisp). */
  hapticStrength: HapticStrength;
  /** Onboarding "Display Text Scale". */
  textScale: TextScale;
  /** Header contrast toggle / onboarding "High Contrast Shield" -> dark high-contrast palette. */
  highContrast: boolean;
  /** Voice On / Muted toggle (Safety header, Explore "Mute Audio"). */
  voiceEnabled: boolean;
  language: Language;
  /** When false, nothing leaves the device: cloud reasoning, face ID and server OCR are disabled. */
  cloudProcessing: boolean;
  /** Opt-in: recognising enrolled people. Off by default. */
  faceRecognition: boolean;
  /** Automatic memory of where objects were seen. */
  memoryEnabled: boolean;
  fallDetection: boolean;
  /** Countdown before emergency dispatch (Stitch shows 8s). */
  emergencyCountdownSec: number;
  spatialAudio: boolean;
  /** Backend base URL, e.g. http://192.168.1.20:8000 - configurable in Settings. */
  backendUrl: string;
};

type Actions = {
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
};

export const defaultSettings: Settings = {
  onboarded: false,
  speechRate: 1.25,
  hapticStrength: 'crisp',
  textScale: 'default',
  highContrast: false,
  voiceEnabled: true,
  language: 'en',
  cloudProcessing: true,
  faceRecognition: false,
  memoryEnabled: true,
  fallDetection: true,
  emergencyCountdownSec: 8,
  spatialAudio: true,
  // USB: `adb reverse tcp:8000 tcp:8000` makes the PC backend reachable at 127.0.0.1 on the phone.
  backendUrl: process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://127.0.0.1:8000',
};

export const useSettings = create<Settings & Actions>()(
  persist(
    (set) => ({
      ...defaultSettings,
      update: (patch) => set(patch),
      reset: () => set(defaultSettings),
    }),
    {
      name: 'settings',
      version: 1,
      storage: createJSONStorage(() => Storage),
      partialize: ({ update: _u, reset: _r, ...rest }) => rest,
    },
  ),
);

/** Non-hook accessor for services running outside React. */
export const getSettings = () => useSettings.getState();

/** True once persisted settings have been loaded from device storage. */
export function useSettingsHydrated(): boolean {
  const [hydrated, setHydrated] = useState(useSettings.persist.hasHydrated());
  useEffect(() => {
    const unsub = useSettings.persist.onFinishHydration(() => setHydrated(true));
    setHydrated(useSettings.persist.hasHydrated());
    return unsub;
  }, []);
  return hydrated;
}
