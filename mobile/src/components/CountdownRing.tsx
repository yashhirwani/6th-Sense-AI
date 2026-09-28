import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '@/theme';

const C = 125.6; // 2 * PI * 20

/** Stitch "SVG Circular Countdown Progress Ring". */
export function CountdownRing({ secondsLeft, total }: { secondsLeft: number; total: number }) {
  const { colors } = useTheme();
  const offset = (1 - Math.max(0, secondsLeft) / Math.max(1, total)) * C;
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" className="w-14 h-14 items-center justify-center">
      <Svg width={56} height={56} viewBox="0 0 48 48" style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={24} cy={24} r={20} fill="none" stroke={colors.error} strokeOpacity={0.2} strokeWidth={4} />
        <Circle cx={24} cy={24} r={20} fill="none" stroke={colors.error} strokeDasharray={`${C}`} strokeDashoffset={offset} strokeLinecap="round" strokeWidth={4.5} />
      </Svg>
      <Text className="absolute font-headline-sm text-headline-sm font-bold text-error">{String(Math.max(0, secondsLeft)).padStart(2, '0')}s</Text>
    </View>
  );
}
