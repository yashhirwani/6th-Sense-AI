import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { useIsFocused } from 'expo-router';
import { registerCamera } from '@/services/camera/cameraRegistry';
import { perceptionStore } from '@/state/perception';

type Props = {
  owner: string;
  showPreview: boolean;
  enableDetection?: boolean;
  style?: ViewStyle;
  className?: string;
  children?: ReactNode;
  extraOutputs?: unknown[];
  permissionFallback?: ReactNode;
};

/**
 * Web preview of the perception camera: the laptop webcam via getUserMedia.
 * Still photos are captured for the AI server (describe / ask / read / scan work end to end).
 * The live on-device YOLO detector is a native TFLite pipeline, so in the browser it is reported as
 * unavailable rather than faked.
 */
export function PerceptionCamera({ owner, showPreview, style, children, permissionFallback }: Props) {
  const focused = useIsFocused();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    perceptionStore.getState().setDetector('unavailable', 'Live obstacle detection runs in the phone app (on-device AI).');
  }, []);

  useEffect(() => {
    if (!focused) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    let unregister: (() => void) | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
        if (cancelled) return;
        setDenied(false);
        const v = videoRef.current ?? document.createElement('video');
        videoRef.current = v;
        v.srcObject = stream;
        v.muted = true;
        v.playsInline = true;
        await v.play();
        unregister = registerCamera(owner, async () => {
          const canvas = document.createElement('canvas');
          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
          canvas.getContext('2d')!.drawImage(v, 0, 0);
          return canvas.toDataURL('image/jpeg', 0.9);
        });
        perceptionStore.getState().setCameraActive(true);
      } catch {
        if (!cancelled) setDenied(true);
      }
    })();
    return () => {
      cancelled = true;
      unregister?.();
      stream?.getTracks().forEach((t) => t.stop());
      perceptionStore.getState().setCameraActive(false);
    };
  }, [focused, owner]);

  if (!showPreview) return null;
  if (denied) return <>{permissionFallback}</>;
  return (
    <View style={style}>
      <video
        ref={(el) => {
          if (el) videoRef.current = el;
        }}
        muted
        playsInline
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />
      {children}
    </View>
  );
}
