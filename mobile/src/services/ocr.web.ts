/**
 * Web preview: ML Kit / Apple Vision OCR only exist on the phone. Reading still works through the server
 * (RapidOCR + Gemini) because an empty on-device result makes the assistant send the photo to the backend.
 */
export function isOcrSupported(): boolean {
  return false;
}

export async function recognizeText(_uri: string): Promise<string> {
  return '';
}
