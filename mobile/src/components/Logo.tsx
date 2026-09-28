import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** "Sensory Iris" logo - vector port of stitch_sixth_sense_ai_assistant/6th_sense_ai_sensory_iris_logo. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" accessibilityLabel="6th Sense AI Sensory Iris Logo">
      <Rect width={120} height={120} rx={28} fill="#191C1E" />
      <Circle cx={60} cy={60} r={44} fill="none" stroke="#D95338" strokeWidth={3} strokeDasharray="14 8" opacity={0.4} />
      <Circle cx={60} cy={60} r={32} fill="none" stroke="#D95338" strokeWidth={4} strokeDasharray="24 10" opacity={0.8} />
      <Circle cx={60} cy={60} r={18} fill="#D95338" />
      <Path
        d="M52 46 C52 40 56 36 62 36 C67 36 71 39 71 44 C71 52 56 56 52 64 C50 67 52 75 60 75 C66 75 70 70 70 65"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={60} cy={65} r={4.5} fill="#FFFFFF" />
    </Svg>
  );
}
