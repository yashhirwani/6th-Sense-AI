import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import { vars } from 'nativewind';
import { useSettings } from '@/state/settings';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const palette = require('./palette.js') as {
  lightColors: Record<ColorToken, string>;
  darkColors: Record<ColorToken, string>;
  toCssVars: (p: Record<string, string>) => Record<string, string>;
};

export type ColorToken =
  | 'primary' | 'on-primary' | 'primary-container' | 'on-primary-container' | 'primary-fixed'
  | 'primary-fixed-dim' | 'on-primary-fixed' | 'on-primary-fixed-variant' | 'inverse-primary'
  | 'secondary' | 'on-secondary' | 'secondary-container' | 'on-secondary-container' | 'secondary-fixed'
  | 'secondary-fixed-dim' | 'on-secondary-fixed' | 'on-secondary-fixed-variant'
  | 'tertiary' | 'on-tertiary' | 'tertiary-container' | 'on-tertiary-container' | 'tertiary-fixed'
  | 'tertiary-fixed-dim' | 'on-tertiary-fixed' | 'on-tertiary-fixed-variant'
  | 'error' | 'on-error' | 'error-container' | 'on-error-container'
  | 'surface' | 'surface-dim' | 'surface-bright' | 'surface-container-lowest' | 'surface-container-low'
  | 'surface-container' | 'surface-container-high' | 'surface-container-highest' | 'surface-variant'
  | 'on-surface' | 'on-surface-variant' | 'inverse-surface' | 'inverse-on-surface' | 'outline'
  | 'outline-variant' | 'surface-tint' | 'background' | 'on-background';

export type Palette = Record<ColorToken, string>;

export const lightColors = palette.lightColors;
export const darkColors = palette.darkColors;

const lightVars = vars(palette.toCssVars(lightColors));
const darkVars = vars(palette.toCssVars(darkColors));

type ThemeValue = { dark: boolean; colors: Palette };
const ThemeContext = createContext<ThemeValue>({ dark: false, colors: lightColors });

/** Colours for places Tailwind classes can't reach (SVG, StatusBar, navigation). */
export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * Applies the Stitch palette (or the derived high-contrast dark palette) as CSS variables to the whole tree.
 * Toggled by the header "contrast" button and the onboarding "High Contrast Shield" switch.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const highContrast = useSettings((s) => s.highContrast);
  const value = useMemo<ThemeValue>(
    () => ({ dark: highContrast, colors: highContrast ? darkColors : lightColors }),
    [highContrast],
  );
  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1 }, highContrast ? darkVars : lightVars]}>{children}</View>
    </ThemeContext.Provider>
  );
}
