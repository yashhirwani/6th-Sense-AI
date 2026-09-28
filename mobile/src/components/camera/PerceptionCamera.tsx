import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform, View, type ViewStyle } from 'react-native';
import { useIsFocused } from 'expo-router';
import {
  Camera,
  CommonResolutions,
  useCamera,
  useCameraPermission,
  useFrameOutput,
  usePhotoOutput,
  type CameraOutput,
  type Frame,
} from 'react-native-vision-camera';
import { useResizer } from 'react-native-vision-camera-resizer';
import { scheduleOnRN } from 'react-native-worklets';
import { registerCamera } from '@/services/camera/cameraRegistry';
import { decodeYolo, MODEL_INPUT } from '@/services/perception/decode';
import type { FrameOrientation } from '@/services/perception/geometry';
import { handleFrameResults, resetPerception } from '@/services/perception/perception';
import type { RawDetection } from '@/services/perception/types';
import { useDetector } from '@/services/perception/useDetector';
import { perceptionStore } from '@/state/perception';

/** Inference interval: ~6-7 fps is plenty for walking pace and keeps battery/thermal in check. */
const INFER_INTERVAL_MS = 150;

type Props = {
  /** Unique owner id (screen name) for the capture registry. */
  owner: string;
  /** Render the live preview (Home, Scan). Hidden cameras still run detection (Explore, Safety). */
  showPreview: boolean;
  enableDetection?: boolean;
  style?: ViewStyle;
  className?: string;
  children?: ReactNode;
  /** Extra outputs, e.g. a barcode scanner on the Scan screen. */
  extraOutputs?: CameraOutput[];
  /** Rendered instead of the preview when permission is missing. */
  permissionFallback?: ReactNode;
};

function useAppActive() {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

function onResults(dets: RawDetection[], orientation: FrameOrientation, mirrored: boolean) {
  handleFrameResults(dets, orientation, mirrored);
}

/**
 * The live perception camera: preview (optional) + on-device YOLO11n every ~150 ms + still capture.
 * Only runs while its screen is focused and the app is in the foreground.
 */
export function PerceptionCamera({ owner, showPreview, enableDetection = true, style, className, children, extraOutputs = [], permissionFallback }: Props) {
  const permission = useCameraPermission();
  const focused = useIsFocused();
  const appActive = useAppActive();
  const isActive = focused && appActive && permission.hasPermission;

  const model = useDetector();
  const { resizer, error: resizerError } = useResizer({
    width: MODEL_INPUT,
    height: MODEL_INPUT,
    channelOrder: 'rgb',
    dataType: 'float32',
    scaleMode: 'cover',
    pixelLayout: 'interleaved',
  });

  useEffect(() => {
    if (resizerError) perceptionStore.getState().setDetector('unavailable', `GPU frame resizer unavailable on this device: ${resizerError.message}`);
  }, [resizerError]);

  const photoOutput = usePhotoOutput({ targetResolution: CommonResolutions.HD_4_3, containerFormat: 'jpeg', quality: 0.85, qualityPrioritization: 'speed' });

  const detectionOn = enableDetection && model != null && resizer != null;
  const onFrame = useCallback(
    (frame: Frame) => {
      'worklet';
      if (!detectionOn || model == null || resizer == null) {
        frame.dispose();
        return;
      }
      const g = globalThis as unknown as { __sixthLastInfer?: number };
      const now = Date.now();
      if (g.__sixthLastInfer != null && now - g.__sixthLastInfer < INFER_INTERVAL_MS) {
        frame.dispose();
        return;
      }
      g.__sixthLastInfer = now;
      const orientation = frame.orientation as FrameOrientation;
      const mirrored = frame.isMirrored;
      const resized = resizer.resize(frame);
      frame.dispose();
      const outputs = model.runSync([resized.getPixelBuffer()]);
      resized.dispose();
      const dets = decodeYolo(new Float32Array(outputs[0]));
      scheduleOnRN(onResults, dets, orientation, mirrored);
    },
    [detectionOn, model, resizer],
  );

  const frameOutput = useFrameOutput({
    targetResolution: CommonResolutions.VGA_4_3,
    pixelFormat: Platform.OS === 'ios' ? 'yuv' : 'native',
    dropFramesWhileBusy: true,
    onFrame,
    onFrameDropped: () => {},
  });

  const outputs = enableDetection ? [photoOutput, frameOutput, ...extraOutputs] : [photoOutput, ...extraOutputs];

  // Register still capture for the assistant while this camera is live.
  const photoRef = useRef(photoOutput);
  photoRef.current = photoOutput;
  useEffect(() => {
    if (!isActive) return;
    const unregister = registerCamera(owner, async () => (await photoRef.current.capturePhotoToFile({ enableShutterSound: false }, {})).filePath);
    perceptionStore.getState().setCameraActive(true);
    return () => {
      unregister();
      perceptionStore.getState().setCameraActive(false);
      resetPerception();
    };
  }, [isActive, owner]);

  if (!permission.hasPermission) return showPreview ? <>{permissionFallback}</> : null;

  if (!showPreview) return <HeadlessCamera isActive={isActive} outputs={outputs} />;

  return (
    <View style={style} className={className}>
      <Camera
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        device="back"
        isActive={isActive}
        outputs={outputs}
        resizeMode="cover"
        onError={(e) => perceptionStore.getState().setDetector('error', `Camera error: ${e.message}`)}
      />
      {children}
    </View>
  );
}

/** Camera session without a preview surface: detection keeps running on screens that don't show video. */
function HeadlessCamera({ isActive, outputs }: { isActive: boolean; outputs: CameraOutput[] }) {
  useCamera({
    device: 'back',
    isActive,
    outputs,
    onError: (e) => perceptionStore.getState().setDetector('error', `Camera error: ${e.message}`),
  });
  return null;
}
