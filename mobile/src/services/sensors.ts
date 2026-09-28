import { useEffect } from 'react';
import { Platform } from 'react-native';
import { LightSensor } from 'expo-sensors';
import { usePerception } from '@/state/perception';

/** Real ambient light (lux) from the Android light sensor; iOS exposes no public light sensor API. */
export function useAmbientLight(active: boolean) {
  useEffect(() => {
    if (!active || Platform.OS !== 'android') {
      if (Platform.OS !== 'android') usePerception.getState().setLux(null);
      return;
    }
    let sub: { remove(): void } | null = null;
    let cancelled = false;
    void LightSensor.isAvailableAsync().then((ok) => {
      if (!ok || cancelled) return;
      LightSensor.setUpdateInterval(1000);
      sub = LightSensor.addListener(({ illuminance }) => usePerception.getState().setLux(Math.round(illuminance)));
    });
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [active]);
}

/** Plain-language light level, matching the Stitch "420 Lux (Optimal)" footer. */
export function lightQuality(lux: number): string {
  if (lux < 10) return 'Very dark';
  if (lux < 80) return 'Dim';
  if (lux < 2000) return 'Optimal';
  return 'Bright';
}
