import { extractTextFromImage, isSupported } from 'expo-text-extractor';

/**
 * On-device OCR: Google ML Kit (Android) / Apple Vision (iOS). Works offline.
 * Latin script on-device; Devanagari and handwriting go to the backend OCR when cloud is enabled.
 */
export function isOcrSupported(): boolean {
  try {
    return isSupported;
  } catch {
    return false;
  }
}

export async function recognizeText(uri: string): Promise<string> {
  const blocks = await extractTextFromImage(uri);
  return blocks
    .map((b) => b.trim())
    .filter(Boolean)
    .join('\n');
}
