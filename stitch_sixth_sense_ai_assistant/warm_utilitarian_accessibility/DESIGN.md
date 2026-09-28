---
name: Warm Utilitarian Accessibility
colors:
  surface: '#fcf9f2'
  surface-dim: '#dcdad3'
  surface-bright: '#fcf9f2'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3ec'
  surface-container: '#f1eee7'
  surface-container-high: '#ebe8e1'
  surface-container-highest: '#e5e2db'
  on-surface: '#1c1c18'
  on-surface-variant: '#59413c'
  inverse-surface: '#31312c'
  inverse-on-surface: '#f3f0e9'
  outline: '#8c716b'
  outline-variant: '#e0bfb8'
  surface-tint: '#ac331b'
  primary: '#a93119'
  on-primary: '#ffffff'
  primary-container: '#cb492f'
  on-primary-container: '#fffbff'
  inverse-primary: '#ffb4a4'
  secondary: '#1c6c40'
  on-secondary: '#ffffff'
  secondary-container: '#a5f4bc'
  on-secondary-container: '#247246'
  tertiary: '#855000'
  on-tertiary: '#ffffff'
  tertiary-container: '#a76600'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdad3'
  primary-fixed-dim: '#ffb4a4'
  on-primary-fixed: '#3e0500'
  on-primary-fixed-variant: '#8b1b05'
  secondary-fixed: '#a5f4bc'
  secondary-fixed-dim: '#8ad7a2'
  on-secondary-fixed: '#00210f'
  on-secondary-fixed-variant: '#00522c'
  tertiary-fixed: '#ffddbb'
  tertiary-fixed-dim: '#ffb868'
  on-tertiary-fixed: '#2b1700'
  on-tertiary-fixed-variant: '#673d00'
  background: '#fcf9f2'
  on-background: '#1c1c18'
  surface-variant: '#e5e2db'
typography:
  display:
    fontFamily: Inter
    fontSize: 2.5rem
    fontWeight: '700'
    lineHeight: 3rem
    letterSpacing: -0.02em
  display-mobile:
    fontFamily: Inter
    fontSize: 2rem
    fontWeight: '700'
    lineHeight: 2.5rem
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Inter
    fontSize: 2rem
    fontWeight: '700'
    lineHeight: 2.5rem
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 1.625rem
    fontWeight: '700'
    lineHeight: 2.125rem
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: 2rem
    letterSpacing: 0em
  headline-sm:
    fontFamily: Inter
    fontSize: 1.25rem
    fontWeight: '600'
    lineHeight: 1.75rem
    letterSpacing: 0em
  body-lg:
    fontFamily: Inter
    fontSize: 1.1875rem
    fontWeight: '400'
    lineHeight: 1.75rem
    letterSpacing: 0em
  body-md:
    fontFamily: Inter
    fontSize: 1.0625rem
    fontWeight: '400'
    lineHeight: 1.625rem
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: '500'
    lineHeight: 1.5rem
    letterSpacing: 0.01em
  label-lg:
    fontFamily: Inter
    fontSize: 1.125rem
    fontWeight: '600'
    lineHeight: 1.5rem
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: '600'
    lineHeight: 1.375rem
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: '700'
    lineHeight: 1.25rem
    letterSpacing: 0.03em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-tablet: 1.5rem
  gutter-desktop: 2rem
  margin: 1.25rem
  margin-tablet: 2rem
  margin-desktop: 3rem
  space-xs: 0.375rem
  space-sm: 0.75rem
  space-md: 1.25rem
  space-lg: 1.75rem
  space-xl: 2.5rem
---

## Brand & Style

The design system establishes a human-centered, deeply dependable visual and structural language tailored for multimodal interfaces supporting visually impaired users. Moving away from cold clinical aesthetics and overstimulating glowing neon palettes, the visual philosophy is rooted in warm tactile utilitarianism: high-contrast legibility, calm reassurance, tangible affordances, and zero decorative noise.

Every interface element prioritizes clarity, cognitive comfort, and instant physical discernibility. The atmosphere combines warm bone tones with deep charcoal text and grounded terracotta focal points. The target audience—spanning low-vision individuals, screen-reader navigators, and users operating primarily via voice and audio cues—requires unambiguous touch targets, distinct boundary definitions, and rigorous adherence to WCAG AAA standards. Visual elements serve strictly functional, reassuring roles that complement auditory and haptic feedback.

## Colors

The color architecture is built around warmth, contrast safety, and strict semantic reliability:

- **Primary (`#D95338`)**: Muted terracotta accent delivering an empowering, warm presence for focal actions, tactile controls, and active state highlights without visual fatigue. Hover and pressed variants drop to `#C4432A` and `#B2361E`.
- **Secondary (`#2D7A4D`)**: Deep sage green reserved for verified safe states, successful object identifications, and confirmation banners. Paired with a soft background tier (`#E8F5ED`).
- **Tertiary (`#B46E00`)**: Deep amber/ochre for ambient warnings, situational awareness cautions, and obstacle proximities. Accompanied by `#FEF6E7` background fills.
- **Critical Alert (`#BA1A1A`)**: Uncompromising high-contrast crimson for direct hazard alerts and collision warnings, paired with `#FFEDEA` container backgrounds.
- **Surfaces & Canvas**: Base canvas rests on soft bone `#FBF9F5`, with primary card containers sitting on `#FFFFFF` and contextual cards on `#F5F2EB`.
- **Text & Hierarchy**: Deep charcoal `#191C1E` for primary typography ensures a contrast ratio exceeding 14:1 against base surfaces. Secondary copy resolves at `#2D3133` (exceeding 9:1), with auxiliary metadata anchored at `#52585C` (exceeding 7:1 WCAG AAA requirements).

## Typography

Typography utilizes Inter exclusively across all display, body, and label roles. Designed for maximum legibility at optical extremes, Inter provides open apertures, tall x-heights, and distinct character glyphs that prevent confusion between ambiguous shapes (such as capital 'I', lowercase 'l', and number '1').

- **Minimum Body Size**: Standard body text starts at 17px (`body-md` / 1.0625rem) to preserve effortless readability for low-vision users. Subordinate captions never drop below 14px (`0.875rem`), and are locked to bold weights (`700`) to retain structural stroke width.
- **Line Heights**: Generous leading ratios between 140% and 155% ensure clear tracking across extended text, screen magnifiers, and voice transcriptions.
- **Letter Spacing**: Deliberately widened tracking on small badges and button labels prevents character crowding when high-magnification modes are engaged.

## Layout & Spacing

The layout model implements a fluid grid structured strictly around generous separation and predictability:

- **Touch and Target Zones**: Vertical rhythms and component paddings prioritize physical ease. Spacing intervals (`space-md`, `space-lg`) provide sufficient buffer zones to eliminate accidental triggers when navigating through tap or swipe gestures.
- **Grid Architecture**: 
  - Mobile: Single-column flow with `1.25rem` margins and `1rem` vertical gutters, ensuring large touch areas spanning edge-to-edge.
  - Tablet: 6-column grid with `1.5rem` gutters and `2rem` margins.
  - Desktop / Hub: 12-column grid capped at a maximum width of `1280px` to maintain comfortable focal tracking without broad eye deflection.
- **Audio & Haptic Alignment**: Visual layout boundaries correspond directly to sequential assistive screen reader sweeps and speech recognition containers.

## Elevation & Depth

Visual hierarchy abandons complex drop shadows and blur layers in favor of physical boundaries and structural contrast:

- **Low-Elevation Structural Borders**: Depth is established via physical 1.5px to 2px solid strokes (`#E3DFD7` for resting containers, `#D0CBC1` for interactive cards) over solid backgrounds.
- **Tonal Layering**: Stacking is conveyed through stepped surface tones: base canvas (`#FBF9F5`), elevated content surface (`#FFFFFF`), and active container tiers (`#F5F2EB`).
- **Focus Rings**: Interactive focus states forgo subtle glows. Elements receive an explicit 3px double-offset outline (`#D95338` outer, 2px white offset space) to ensure universal visibility regardless of ambient display lighting.
- **Restrained Shadowing**: Where elevation is essential for floating utility buttons (e.g., persistent audio dictation), use a single low-diffusion, tinted ambient shadow: `0 4px 12px rgba(25, 28, 30, 0.08)`.

## Shapes

The design system employs a roundedness setting of `2` (0.5rem base radius, 1rem for large containers, and 1.5rem for expansive alert cards). 

This moderate curvature produces approachable, friendly corners that visually demarcate touch bounds without reducing active touch target corners. Corner radii remain uniform across all borders to prevent optical warping during screen-magnifier zoom modes.

## Components

### Buttons & Interactive Triggers
- **Primary Buttons**: Terracotta background (`#D95338`), white text (`#FFFFFF`), minimum height of 56px (`3.5rem`), bold 16px label (`label-md`), 2px border radius of `0.5rem`. Tactile pressed state shifts to `#B2361E`.
- **Secondary Buttons**: Neutral card surface (`#FFFFFF`), 2px solid border (`#D0CBC1`), deep charcoal text (`#191C1E`).
- **Voice Trigger Button**: Prominent circular or high-profile button (minimum 64px x 64px) with high-contrast icon and clear sound wave feedback indicator.

### Chips & Semantic Status Badges
- Minimum height of 36px with bold 14px typography (`label-sm`).
- **Safe / Success**: `#E8F5ED` fill, 1.5px solid `#2D7A4D` border, `#2D7A4D` text.
- **Caution / Obstacle**: `#FEF6E7` fill, 1.5px solid `#B46E00` border, `#B46E00` text.
- **Critical / Danger**: `#FFEDEA` fill, 2px solid `#BA1A1A` border, `#BA1A1A` text.
- Badges must include explicit text alongside any iconography to satisfy dual-mode accessibility.

### Cards & Container Panels
- Surface fill is pure white (`#FFFFFF`) mounted on `#FBF9F5` base canvas.
- Perimeter defined by a 1.5px solid `#E3DFD7` border.
- Padding inside cards is standardized to `space-md` (20px) on mobile and `space-lg` (28px) on larger viewports.

### Form Inputs & Voice Fields
- Minimum touch height of 56px with a 2px solid border (`#D0CBC1`).
- Background fill of `#FFFFFF` with primary text in `#191C1E` at 17px (`body-md`).
- Focus state instantly thickens to 3px solid `#D95338`.
- Integrated microphone toggle always remains visible within the right padding boundary.

### Checkboxes & Radio Controls
- Minimum dimensions of 28px x 28px enclosed in a 48px touch boundary.
- 2px high-contrast border in `#191C1E` when unchecked; solid `#D95338` fill with distinct white geometric marker when checked.

### Audio & Haptic Feedback Indicators
- Multimodal live speech transcriptions appear within dedicated live-region cards using `#F5F2EB` background and `#191C1E` high-contrast typography, accompanied by distinct auditory earcons and haptic pulse confirmations.