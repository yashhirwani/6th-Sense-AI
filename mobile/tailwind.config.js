/**
 * Design tokens copied verbatim from the Stitch export
 * (stitch_sixth_sense_ai_assistant/<screen>/code.html, inline tailwind.config), which is the visual source of truth.
 * Where DESIGN.md disagrees (e.g. primary #D95338 vs #a93119) the exported config wins, because
 * that is what the rendered screens use.
 */
const { lightColors, darkColors } = require('./src/theme/palette');

/** Expose each colour as an rgb CSS variable so the dark / high-contrast theme can swap them at runtime. */
const colors = Object.fromEntries(
  Object.keys(lightColors).map((name) => [name, `rgb(var(--color-${name}) / <alpha-value>)`]),
);

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors,
      borderRadius: { DEFAULT: '0.25rem', lg: '0.5rem', xl: '0.75rem', full: '9999px' },
      spacing: {
        'space-xs': '0.375rem',
        margin: '1.25rem',
        'space-md': '1.25rem',
        'space-sm': '0.75rem',
        gutter: '1rem',
        'margin-desktop': '3rem',
        'margin-tablet': '2rem',
        'space-lg': '1.75rem',
        'space-xl': '2.5rem',
        'gutter-desktop': '2rem',
        'gutter-tablet': '1.5rem',
      },
      fontFamily: {
        // All Stitch font-* roles are Inter; weights are selected via fontWeight (embedded font family).
        'headline-md': ['Inter'],
        'headline-sm': ['Inter'],
        'headline-lg': ['Inter'],
        'label-sm': ['Inter'],
        'body-sm': ['Inter'],
        'label-lg': ['Inter'],
        'display-mobile': ['Inter'],
        'body-md': ['Inter'],
        'body-lg': ['Inter'],
        'label-md': ['Inter'],
        'headline-lg-mobile': ['Inter'],
        display: ['Inter'],
        symbols: ['MaterialSymbolsOutlined'],
        'symbols-fill': ['MaterialSymbolsFilled'],
      },
      fontSize: {
        'headline-md': ['1.5rem', { lineHeight: '2rem', letterSpacing: '0em', fontWeight: '600' }],
        'headline-sm': ['1.25rem', { lineHeight: '1.75rem', letterSpacing: '0em', fontWeight: '600' }],
        'headline-lg': ['2rem', { lineHeight: '2.5rem', letterSpacing: '-0.01em', fontWeight: '700' }],
        'label-sm': ['0.875rem', { lineHeight: '1.25rem', letterSpacing: '0.03em', fontWeight: '700' }],
        'body-sm': ['1rem', { lineHeight: '1.5rem', letterSpacing: '0.01em', fontWeight: '500' }],
        'label-lg': ['1.125rem', { lineHeight: '1.5rem', letterSpacing: '0.01em', fontWeight: '600' }],
        'display-mobile': ['2rem', { lineHeight: '2.5rem', letterSpacing: '-0.01em', fontWeight: '700' }],
        'body-md': ['1.0625rem', { lineHeight: '1.625rem', letterSpacing: '0em', fontWeight: '400' }],
        'body-lg': ['1.1875rem', { lineHeight: '1.75rem', letterSpacing: '0em', fontWeight: '400' }],
        'label-md': ['1rem', { lineHeight: '1.375rem', letterSpacing: '0.02em', fontWeight: '600' }],
        'headline-lg-mobile': ['1.625rem', { lineHeight: '2.125rem', letterSpacing: '-0.01em', fontWeight: '700' }],
        display: ['2.5rem', { lineHeight: '3rem', letterSpacing: '-0.02em', fontWeight: '700' }],
      },
    },
  },
  plugins: [],
};
