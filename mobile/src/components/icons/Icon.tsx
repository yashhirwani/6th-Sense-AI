import { Text, type TextProps } from 'react-native';
import glyphs from './glyphs.json';

const GLYPHS = glyphs as Record<string, number>;

/**
 * Glyphs used in the Stitch export that do not exist in the current Material Symbols font
 * (they render as broken ligatures in the Stitch screenshots). Mapped to the nearest real symbol.
 */
const SUBSTITUTES: Record<string, string> = {
  chat_spark: 'forum',
  pixel_4_4xl_4a_5_5a_5g: 'crisis_alert',
};

export type IconProps = Omit<TextProps, 'children'> & {
  /** Material Symbols name, exactly as in the Stitch HTML (e.g. "graphic_eq"). */
  name: string;
  /** Pixel size (Stitch uses text-[NNpx]). */
  size?: number;
  /** Equivalent of `font-variation-settings: 'FILL' 1`. */
  filled?: boolean;
  className?: string;
};

/** Material Symbols Outlined icon. Decorative by default: hidden from screen readers unless a label is given. */
export function Icon({ name, size = 24, filled = false, style, accessibilityLabel, ...rest }: IconProps) {
  const resolved = SUBSTITUTES[name] ?? name;
  const code = GLYPHS[resolved];
  if (__DEV__ && code === undefined) console.warn(`[Icon] unknown Material Symbol "${name}"`);
  return (
    <Text
      {...rest}
      accessibilityLabel={accessibilityLabel}
      accessible={!!accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
      allowFontScaling={false}
      style={[
        {
          fontFamily: filled ? 'MaterialSymbolsFilled' : 'MaterialSymbolsOutlined',
          fontSize: size,
          lineHeight: size,
          width: size,
          height: size,
          textAlign: 'center',
          includeFontPadding: false,
          fontWeight: '400',
        },
        style,
      ]}
    >
      {code === undefined ? '' : String.fromCodePoint(code)}
    </Text>
  );
}
