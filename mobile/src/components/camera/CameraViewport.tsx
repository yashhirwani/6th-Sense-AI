import { useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { requestPermission } from '@/services/permissions';
import { Icon } from '../icons/Icon';
import { PerceptionCamera } from './PerceptionCamera';
import { bearingWord, shortDistance, spokenBearing, spokenDistance, squareToView } from '@/services/perception/geometry';
import type { Detection } from '@/services/perception/types';
import { haptic } from '@/services/haptics';
import { usePerception } from '@/state/perception';
import { useTheme } from '@/theme';

const MAX_PINS = 5;
const VIEW_ASPECT = 4 / 3;

/** Pin icon colour per object family, following the Stitch pins (primary-fixed / secondary-fixed / tertiary-fixed). */
function pinIconClass(d: Detection) {
  if (d.label === 'person') return 'text-tertiary-fixed';
  if (['chair', 'couch', 'bench', 'dining table', 'bed'].includes(d.label)) return 'text-primary-fixed';
  return 'text-secondary-fixed';
}

/** "Live Optical Iris Viewport" - real camera preview with live detection pins. */
export function CameraViewport() {
  const detections = usePerception((s) => s.detections);
  const fps = usePerception((s) => s.fps);
  const detectorState = usePerception((s) => s.detectorState);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [showPins, setShowPins] = useState(true);

  const pins = [...detections].sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h).slice(0, MAX_PINS);
  const a11ySummary = detections.length
    ? `Camera view. Detected: ${pins.map((d) => `${d.name} ${spokenDistance(d.distanceM)} ${spokenBearing(d.bearing)}`).join('; ')}.`
    : 'Camera view. No objects detected right now.';

  const status =
    detectorState === 'ready'
      ? `Wide Angle • ${fps.toFixed(0)} FPS AI`
      : detectorState === 'loading' || detectorState === 'idle'
        ? 'Loading detector…'
        : 'Detector unavailable';

  return (
    <View
      accessible
      accessibilityLabel={a11ySummary}
      className="relative w-full rounded-xl overflow-hidden bg-inverse-surface shadow-md"
      style={{ aspectRatio: VIEW_ASPECT }}
      onLayout={(e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      <PerceptionCamera owner="home" showPreview style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.85 }} permissionFallback={<PermissionFallback />} />
      <Vignette />
      {showPins &&
        size.w > 0 &&
        pins.map((d) => {
          const v = squareToView(d.box, 0.75, VIEW_ASPECT);
          const cx = (v.x + v.w / 2) * size.w;
          const cy = Math.min(0.8, Math.max(0.05, v.y + v.h / 2)) * size.h;
          const dist = shortDistance(d.distanceM);
          return (
            <View
              key={d.id}
              pointerEvents="none"
              className="absolute flex-row items-center gap-1.5 bg-inverse-surface/90 px-2.5 py-1.5 rounded-lg shadow-md"
              style={{ left: Math.max(4, Math.min(size.w - 150, cx - 60)), top: cy - 14 }}
            >
              <Icon name={d.icon} size={18} className={pinIconClass(d)} />
              <Text className="font-label-sm text-label-sm tracking-tight text-inverse-on-surface">
                {cap(d.name)}
                {dist ? ` • ${dist}` : ''} {bearingWord(d.bearing)}
              </Text>
            </View>
          );
        })}
      <View pointerEvents="box-none" className="absolute left-3 right-3 bottom-3 flex-row items-center justify-between gap-space-xs">
        <View className="flex-row items-center gap-1.5 bg-inverse-surface/90 px-2.5 py-1 rounded-md">
          <View className={`w-2 h-2 rounded-full ${detectorState === 'ready' ? 'bg-secondary' : 'bg-tertiary'}`} />
          <Text className="font-label-sm text-label-sm text-inverse-on-surface">{status}</Text>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: showPins }}
          accessibilityLabel="Show detection labels on the camera view"
          onPress={() => {
            haptic('tap');
            setShowPins((v) => !v);
          }}
          className="min-w-[44px] min-h-[44px] items-center justify-center rounded-lg bg-surface-container-lowest/90 shadow-sm active:scale-95"
        >
          <Icon name="filter_center_focus" size={20} className="text-on-surface" />
        </Pressable>
      </View>
    </View>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Vignette() {
  const { colors } = useTheme();
  const c = colors['inverse-surface'];
  return (
    <LinearGradient
      pointerEvents="none"
      colors={[`${c}99`, `${c}00`, c]}
      locations={[0, 0.5, 1]}
      style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
    />
  );
}

function PermissionFallback() {
  return (
    <View className="absolute inset-0 items-center justify-center p-space-md gap-space-sm">
      <Icon name="photo_camera" size={36} className="text-inverse-on-surface" />
      <Text className="font-body-md text-body-md text-inverse-on-surface text-center">Camera access is needed to describe your surroundings and warn about hazards.</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Allow camera access"
        onPress={() => void requestPermission('camera')}
        className="min-h-[48px] px-space-md rounded-lg bg-primary items-center justify-center"
      >
        <Text className="font-label-md text-label-md text-on-primary">Allow camera</Text>
      </Pressable>
    </View>
  );
}
