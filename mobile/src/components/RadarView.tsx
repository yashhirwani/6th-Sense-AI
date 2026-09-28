import { Text, View } from 'react-native';
import Svg, { Circle, G, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { shortDistance, spokenBearing, spokenDistance } from '@/services/perception/geometry';
import type { Detection } from '@/services/perception/types';
import { tts } from '@/services/audio/tts';
import { spatialAudio } from '@/services/audio/spatialAudio';
import { useTheme } from '@/theme';

const W = 320;
const H = 160;
const ORIGIN = { x: 160, y: 150 };
/** Outer ring radius (px) represents this many metres. */
const MAX_M = 5;
const R_MAX = 130;

/** Top-down position from the real horizontal angle and approximate distance. */
export function radarPoint(d: Pick<Detection, 'angleDeg' | 'distanceM'>) {
  const m = Math.min(MAX_M, d.distanceM ?? MAX_M * 0.85);
  const r = (m / MAX_M) * R_MAX;
  // The camera sees about +-27 degrees; spread it a little on the radar so items are distinguishable.
  const a = ((d.angleDeg * 1.6) * Math.PI) / 180;
  return { x: ORIGIN.x + Math.sin(a) * r, y: ORIGIN.y - Math.cos(a) * r };
}

function colourFor(d: Detection, c: Record<string, string>) {
  if (d.label === 'person') return { fill: c['secondary'], ring: c['on-secondary-container'] };
  if (d.bearing === 'front' && d.distanceM != null && d.distanceM < 2) return { fill: c['primary-container'], ring: c['primary'] };
  return { fill: c['tertiary'], ring: c['tertiary'] };
}

/** "Sensory Iris Spatial Depth" radar: live top-down view of tracked detections. */
export function RadarView({ detections }: { detections: Detection[] }) {
  const { colors } = useTheme();
  const outline = colors.outline;
  const items = detections.slice(0, 8);
  return (
    <View className="relative w-full h-44 bg-surface-container-high rounded-xl overflow-hidden items-center justify-center p-2">
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} fill="none" accessibilityLabel="Top-down visual sonar of room obstacles">
        <Circle cx={ORIGIN.x} cy={ORIGIN.y} r={130} stroke={outline} strokeDasharray="4 4" strokeOpacity={0.25} strokeWidth={1.5} />
        <Circle cx={ORIGIN.x} cy={ORIGIN.y} r={90} stroke={outline} strokeDasharray="4 4" strokeOpacity={0.3} strokeWidth={1.5} />
        <Circle cx={ORIGIN.x} cy={ORIGIN.y} r={50} stroke={outline} strokeOpacity={0.35} strokeWidth={1.5} />
        <Line x1={160} y1={150} x2={45} y2={40} stroke={outline} strokeOpacity={0.2} strokeWidth={1} />
        <Line x1={160} y1={150} x2={275} y2={40} stroke={outline} strokeOpacity={0.2} strokeWidth={1} />
        <Line x1={160} y1={150} x2={160} y2={10} stroke={colors.primary} strokeDasharray="2 2" strokeOpacity={0.4} strokeWidth={1.5} />
        {items.map((d) => {
          const p = radarPoint(d);
          const col = colourFor(d, colors);
          const label = `${d.name.toUpperCase()} ${shortDistance(d.distanceM)}`.trim();
          const speak = () => {
            spatialAudio.play('object', { angleDeg: d.angleDeg });
            tts.speak(`${d.name}, ${[spokenDistance(d.distanceM), spokenBearing(d.bearing)].filter(Boolean).join(' ')}.`, { priority: 'high', bearing: d.bearing, earcon: null });
          };
          return (
            <G key={d.id} onPress={speak} accessibilityLabel={`${d.name} ${spokenDistance(d.distanceM)} ${spokenBearing(d.bearing)}`}>
              {d.label === 'dining table' ? (
                <Rect x={p.x - 8} y={p.y - 6} width={16} height={12} rx={3} fill={col.fill} />
              ) : (
                <>
                  <Circle cx={p.x} cy={p.y} r={8} fill={col.fill} />
                  <Circle cx={p.x} cy={p.y} r={14} stroke={col.ring} strokeDasharray="3 2" strokeWidth={1.5} />
                </>
              )}
              <SvgText x={p.x} y={Math.min(H - 4, p.y + 24)} fill={col.ring} fontSize={10} fontWeight="700" textAnchor="middle">
                {label}
              </SvgText>
            </G>
          );
        })}
        <Circle cx={160} cy={150} r={7} fill={colors['on-surface']} />
        <Circle cx={160} cy={150} r={14} stroke={colors['primary-container']} strokeWidth={2} />
        <Polygon points="160,138 155,146 165,146" fill={colors.primary} />
      </Svg>
      <View pointerEvents="none" className="absolute bottom-2 left-3 right-3 flex-row justify-between">
        <Text className="font-label-sm text-label-sm text-on-surface-variant">← Left</Text>
        <Text className="font-label-sm text-label-sm font-bold text-primary">Center Arc</Text>
        <Text className="font-label-sm text-label-sm text-on-surface-variant">Right →</Text>
      </View>
    </View>
  );
}
