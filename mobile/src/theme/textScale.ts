import { useEffect } from 'react';
import { rem } from 'nativewind';
import { useSettings, type TextScale } from '@/state/settings';

/** Root rem in px. Stitch is authored against 16px; larger scales zoom text AND spacing together. */
export const REM_FOR_SCALE: Record<TextScale, number> = { default: 16, large: 18, xl: 20 };

// NativeWind defaults to 14px; set the design's 16px before the first render.
rem.set(REM_FOR_SCALE.default);

/** Keeps NativeWind's runtime rem in sync with the "Display Text Scale" setting. System font scaling still applies on top. */
export function useTextScale() {
  const scale = useSettings((s) => s.textScale);
  useEffect(() => {
    rem.set(REM_FOR_SCALE[scale]);
  }, [scale]);
}
