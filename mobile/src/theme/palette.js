/**
 * Colour tokens.
 * - lightColors: verbatim from the Stitch export (source of truth).
 * - darkColors: high-contrast dark variant derived from the SAME Material 3 tonal families
 *   (inverse-primary, *-fixed-dim, etc.) - the Stitch design defines `darkMode: "class"` but ships no
 *   dark tokens, and the header's "contrast" toggle needs something to switch to.
 * Plain CommonJS so tailwind.config.js can require it.
 */
const lightColors = {
  'on-secondary-container': '#247246',
  'on-error-container': '#93000a',
  'inverse-surface': '#31312c',
  secondary: '#1c6c40',
  'on-surface-variant': '#59413c',
  'surface-variant': '#e5e2db',
  'on-secondary': '#ffffff',
  'on-primary-fixed': '#3e0500',
  'primary-container': '#cb492f',
  'tertiary-container': '#a76600',
  'outline-variant': '#e0bfb8',
  'surface-container-low': '#f6f3ec',
  'on-primary-fixed-variant': '#8b1b05',
  'error-container': '#ffdad6',
  'inverse-primary': '#ffb4a4',
  'secondary-fixed': '#a5f4bc',
  'surface-container': '#f1eee7',
  'on-secondary-fixed-variant': '#00522c',
  'surface-container-lowest': '#ffffff',
  'tertiary-fixed': '#ffddbb',
  error: '#ba1a1a',
  'surface-container-high': '#ebe8e1',
  'on-secondary-fixed': '#00210f',
  'primary-fixed-dim': '#ffb4a4',
  surface: '#fcf9f2',
  'surface-dim': '#dcdad3',
  primary: '#a93119',
  'on-error': '#ffffff',
  'tertiary-fixed-dim': '#ffb868',
  'on-background': '#1c1c18',
  'on-primary-container': '#fffbff',
  tertiary: '#855000',
  outline: '#8c716b',
  'secondary-container': '#a5f4bc',
  'on-tertiary-container': '#fffbff',
  'primary-fixed': '#ffdad3',
  'inverse-on-surface': '#f3f0e9',
  'surface-container-highest': '#e5e2db',
  'on-tertiary-fixed-variant': '#673d00',
  'on-tertiary-fixed': '#2b1700',
  'secondary-fixed-dim': '#8ad7a2',
  'surface-bright': '#fcf9f2',
  'on-primary': '#ffffff',
  'on-surface': '#1c1c18',
  background: '#fcf9f2',
  'on-tertiary': '#ffffff',
  'surface-tint': '#ac331b',
};

const darkColors = {
  ...lightColors,
  surface: '#12120f',
  'surface-bright': '#12120f',
  background: '#12120f',
  'surface-dim': '#0b0b09',
  'surface-container-lowest': '#1f1f1b',
  'surface-container-low': '#1a1a16',
  'surface-container': '#262621',
  'surface-container-high': '#302f2a',
  'surface-container-highest': '#3b3a34',
  'surface-variant': '#3b3a34',
  'on-surface': '#f6f3ec',
  'on-background': '#f6f3ec',
  'on-surface-variant': '#ecd6d0',
  outline: '#b09690',
  'outline-variant': '#59413c',
  'inverse-surface': '#e5e2db',
  'inverse-on-surface': '#31312c',
  primary: '#ffb4a4',
  'on-primary': '#3e0500',
  'primary-container': '#8b1b05',
  'on-primary-container': '#ffdad3',
  'surface-tint': '#ffb4a4',
  secondary: '#8ad7a2',
  'on-secondary': '#00210f',
  'secondary-container': '#00522c',
  'on-secondary-container': '#a5f4bc',
  tertiary: '#ffb868',
  'on-tertiary': '#2b1700',
  'tertiary-container': '#673d00',
  'on-tertiary-container': '#ffddbb',
  error: '#ffb4ab',
  'on-error': '#690005',
  'error-container': '#93000a',
  'on-error-container': '#ffdad6',
};

function hexToRgbTriplet(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** { '--color-primary': '169 49 25', ... } for NativeWind `vars()`. */
function toCssVars(palette) {
  return Object.fromEntries(
    Object.entries(palette).map(([k, v]) => [`--color-${k}`, hexToRgbTriplet(v)]),
  );
}

module.exports = { lightColors, darkColors, toCssVars, hexToRgbTriplet };
