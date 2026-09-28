import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking } from 'react-native';
import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { VisionCamera } from 'react-native-vision-camera';

export type PermKey = 'camera' | 'microphone' | 'location' | 'motion';
export type PermStatus = 'granted' | 'denied' | 'undetermined';

async function status(key: PermKey): Promise<{ status: PermStatus; canAsk: boolean }> {
  try {
    switch (key) {
      case 'camera': {
        const s = VisionCamera.cameraPermissionStatus;
        return { status: s === 'authorized' ? 'granted' : s === 'not-determined' ? 'undetermined' : 'denied', canAsk: s === 'not-determined' };
      }
      case 'microphone': {
        const p = await ExpoSpeechRecognitionModule.getPermissionsAsync();
        return { status: p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied', canAsk: p.canAskAgain };
      }
      case 'location': {
        const p = await Location.getForegroundPermissionsAsync();
        return { status: p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied', canAsk: p.canAskAgain };
      }
      case 'motion': {
        const p = await Pedometer.getPermissionsAsync();
        return { status: p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied', canAsk: p.canAskAgain };
      }
    }
  } catch {
    return { status: 'denied', canAsk: false };
  }
}

export async function requestPermission(key: PermKey): Promise<boolean> {
  const cur = await status(key);
  if (cur.status === 'granted') return true;
  if (!cur.canAsk) {
    await Linking.openSettings();
    return false;
  }
  try {
    switch (key) {
      case 'camera':
        return await VisionCamera.requestCameraPermission();
      case 'microphone':
        return (await ExpoSpeechRecognitionModule.requestPermissionsAsync()).granted;
      case 'location':
        return (await Location.requestForegroundPermissionsAsync()).granted;
      case 'motion':
        return (await Pedometer.requestPermissionsAsync()).granted;
    }
  } catch {
    return false;
  }
}

/** Live permission states; re-checked when the app returns from system settings. */
export function usePermissions(keys: PermKey[]) {
  const [state, setState] = useState<Record<string, PermStatus>>({});
  const refresh = useCallback(async () => {
    const entries = await Promise.all(keys.map(async (k) => [k, (await status(k)).status] as const));
    setState(Object.fromEntries(entries));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys.join(',')]);
  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void refresh());
    return () => sub.remove();
  }, [refresh]);
  return { state, refresh };
}
