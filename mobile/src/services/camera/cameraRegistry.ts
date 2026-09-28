import * as ImageManipulator from 'expo-image-manipulator';

/**
 * The screen whose camera is currently active registers a capture function here, so the assistant
 * (voice orb, quick actions, bottom-bar mic) can grab a still frame from whichever camera is live.
 */
type CaptureFn = () => Promise<string>; // local file path (native) or data: URL (web preview)

let active: { owner: string; capture: CaptureFn } | null = null;

export function registerCamera(owner: string, capture: CaptureFn) {
  active = { owner, capture };
  return () => {
    if (active?.owner === owner) active = null;
  };
}

export function hasCamera() {
  return active != null;
}

export type CapturedImage = { uri: string; base64: string; width: number; height: number };

/**
 * Capture a still and downscale it for upload: long side <= 768 px, JPEG q=0.7 (~60-90 KB).
 * Frames are never uploaded continuously - only when the user asks, or for a hazard sweep.
 */
export async function captureForUpload(maxSide = 768): Promise<CapturedImage> {
  if (!active) throw new Error('The camera is not active.');
  const path = await active.capture();
  const uri = toUri(path);
  // Render once to learn the orientation, then scale the LONG side down to maxSide.
  const original = await ImageManipulator.ImageManipulator.manipulate(uri).renderAsync();
  const portrait = original.height >= original.width;
  const ctx = ImageManipulator.ImageManipulator.manipulate(uri);
  if (Math.max(original.width, original.height) > maxSide) {
    ctx.resize(portrait ? { width: null, height: maxSide } : { width: maxSide, height: null });
  }
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true });
  return { uri: out.uri, base64: out.base64 ?? '', width: out.width, height: out.height };
}

/** Full-resolution still for on-device OCR (text needs detail). */
export async function captureFull(): Promise<string> {
  if (!active) throw new Error('The camera is not active.');
  const path = await active.capture();
  return toUri(path);
}

/** Native captures return bare file paths; web captures return data: URLs. */
function toUri(path: string) {
  return /^(file|data|blob|https?):/.test(path) ? path : `file://${path}`;
}
