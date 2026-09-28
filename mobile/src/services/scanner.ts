import { assistantStore } from '@/state/assistant';
import { getSettings } from '@/state/settings';
import { assistStream } from './api/client';
import type { AssistMode } from './api/types';
import { tts } from './audio/tts';
import { captureForUpload, captureFull, hasCamera } from './camera/cameraRegistry';
import { haptic } from './haptics';
import { recognizeText } from './ocr';
import { saveScan, type ScanKind } from './scans';
import { SentenceStreamer } from './assistant/sentences';

export type ScanMode = 'text' | 'product' | 'currency' | 'medicine';

export type ScanField = { label: string; value: string | null };
export type ScanResult = {
  mode: ScanMode;
  title: string;
  summary: string;
  fields: ScanField[];
  source: 'device' | 'cloud' | 'local-llm';
  confidence?: number | null;
  warnings?: string[];
  rawText?: string | null;
};

const MODE_TO_ASSIST: Record<ScanMode, AssistMode> = { text: 'read', product: 'product', currency: 'currency', medicine: 'medicine' };
const MODE_TO_KIND: Record<ScanMode, ScanKind> = { text: 'document', product: 'product', currency: 'currency', medicine: 'medicine' };

const str = (v: unknown): string | null => (v == null || v === '' ? null : Array.isArray(v) ? (v.length ? v.join(', ') : null) : String(v));

/** Map the backend's structured payload to display fields. Missing values stay null ("Not found on label"). */
export function fieldsFor(mode: ScanMode, s: Record<string, unknown> | null): ScanField[] {
  const d = s ?? {};
  switch (mode) {
    case 'product': {
      const n = (d.nutrition ?? {}) as Record<string, unknown>;
      return [
        { label: 'Product', value: str(d.name) },
        { label: 'Brand', value: str(d.brand) },
        { label: 'Price', value: str(d.price) },
        { label: 'Expiry / Best before', value: str(d.expiry) },
        { label: 'Protein (per 100g)', value: str(n.protein_100g) },
        { label: 'Sugar (per 100g)', value: str(n.sugars_100g) },
        { label: 'Energy (per 100g)', value: str(n.energy_kcal_100g) },
        { label: 'Allergens', value: str(d.allergens) },
        { label: 'Ingredients', value: str(d.ingredients) },
        { label: 'Barcode', value: str(d.barcode) },
      ];
    }
    case 'medicine':
      return [
        { label: 'Medicine name', value: str(d.name) },
        { label: 'Strength / dosage on label', value: str(d.strength) },
        { label: 'Expiry', value: str(d.expiry) },
        { label: 'Label instructions', value: str(d.instructions) },
        { label: 'Warnings on label', value: str(d.warnings) },
        { label: 'Manufacturer', value: str(d.manufacturer) },
      ];
    case 'currency':
      return [
        { label: 'Denomination', value: str(d.denomination) },
        { label: 'Currency', value: str(d.currency) },
        { label: 'Side / orientation', value: str(d.orientation) },
        { label: 'Condition', value: str(d.condition) },
        { label: 'Confidence', value: d.confidence != null ? `${Math.round(Number(d.confidence) * 100)}%` : null },
      ];
    default:
      return [];
  }
}

/**
 * Run a scan. On-device OCR always runs first for text-based modes (fast, offline); the server adds
 * structure (product database, medicine fields, currency recognition) when cloud processing is on.
 */
export async function runScan(mode: ScanMode, barcode: string | null, onPartial: (text: string) => void): Promise<ScanResult> {
  if (!hasCamera()) throw new Error('The camera is not ready yet.');
  haptic('tap');
  tts.speak(mode === 'currency' ? 'Checking the note.' : 'Scanning.', { priority: 'high', log: false, replayable: false, earcon: 'info' });

  let ocr = '';
  if (mode !== 'currency') {
    try {
      ocr = await recognizeText(await captureFull());
    } catch {
      ocr = '';
    }
  }

  const cloud = getSettings().cloudProcessing && assistantStore.getState().backendOnline !== false;
  if (!cloud) {
    if (mode === 'currency') throw new Error('Recognising bank notes needs the server. Turn on cloud processing or connect to the internet.');
    if (!ocr) throw new Error("I couldn't find readable text. Hold the item about 30 centimetres away in good light.");
    const res: ScanResult = {
      mode,
      title: ocr.split('\n')[0].slice(0, 60),
      summary: ocr,
      fields: mode === 'text' ? [] : [{ label: 'Label text (on-device, unstructured)', value: ocr }],
      source: 'device',
      rawText: ocr,
      warnings: mode === 'medicine' ? ['Read on the device without the server: fields were not extracted. Always check medicine details with a pharmacist.'] : undefined,
    };
    speakResult(res);
    saveScan(MODE_TO_KIND[mode], res.title, ocr, null);
    return res;
  }

  const img = await captureForUpload(1280);
  assistantStore.getState().setStatus('processing');
  const splitter = new SentenceStreamer();
  let streamed = '';
  const result = await assistStream(
    { mode: MODE_TO_ASSIST[mode], image_b64: img.base64, ocr_text: ocr || undefined, barcode, language: getSettings().language },
    (delta) => {
      streamed += delta;
      onPartial(streamed);
      splitter.push(delta).forEach((s) => tts.speak(s, { append: true, log: false, replayable: false, earcon: null }));
    },
  );
  const rest = splitter.flush();
  if (rest) tts.speak(rest, { append: true, log: false, replayable: false, earcon: null });
  if (!streamed && result.answer) tts.speak(result.answer, { append: true, log: false, replayable: false, earcon: null });
  tts.recordNarration(result.answer);
  if (assistantStore.getState().status === 'processing') assistantStore.getState().setStatus('idle');

  const s = result.structured ?? {};
  const res: ScanResult = {
    mode,
    title: str(s.name) ?? str(s.denomination) ?? result.answer.split(/[.!?]/)[0].slice(0, 60),
    summary: result.answer,
    fields: fieldsFor(mode, s),
    source: result.source === 'cloud-vlm' ? 'cloud' : result.source === 'local-llm' ? 'local-llm' : 'device',
    confidence: typeof s.confidence === 'number' ? s.confidence : null,
    warnings: Array.isArray(s.notices) ? (s.notices as string[]) : undefined,
    rawText: (s.text as string | undefined) ?? ocr ?? null,
  };
  haptic('success');
  saveScan(MODE_TO_KIND[mode], res.title, res.summary, s);
  return res;
}

function speakResult(r: ScanResult) {
  tts.speak(r.summary, { priority: 'normal' });
}
