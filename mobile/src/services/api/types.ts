/**
 * Mobile <-> backend contract (mirrored by backend/app/schemas.py). Version: v1.
 */
export type AssistMode =
  | 'describe' // "What is around me?"
  | 'ask' // free-form question about the scene
  | 'find' // "Find my keys" (open-vocabulary)
  | 'read' // OCR + read aloud
  | 'document' // summarize / translate / Q&A over a document
  | 'product'
  | 'currency'
  | 'medicine'
  | 'people'; // social assistant: who is here / waving

export type WireDetection = {
  label: string;
  confidence: number;
  box: { x: number; y: number; w: number; h: number };
  bearing: 'left' | 'front' | 'right';
  clock: number;
  distance_m: number | null;
  approaching: boolean;
};

export type WireLocation = { lat: number; lon: number; accuracy_m?: number | null; place?: string | null };

export type AssistRequest = {
  mode: AssistMode;
  query?: string;
  language: 'en' | 'hi';
  /** JPEG, base64 (no data: prefix), long side <= 768px. Omitted for text-only follow-ups. */
  image_b64?: string;
  /** On-device detections for the same frame: grounds the model and saves server compute. */
  detections?: WireDetection[];
  /** Text already recognised on-device (ML Kit / Vision). */
  ocr_text?: string;
  location?: WireLocation | null;
  conversation_id?: string | null;
  /** Barcode payload for product scans. */
  barcode?: string | null;
  /** User opted in to recognising enrolled people (Settings). The server never identifies faces otherwise. */
  allow_faces?: boolean;
};

export type ServerHazard = {
  label: string;
  severity: 'caution' | 'warning' | 'critical';
  bearing: 'left' | 'front' | 'right';
  distance_m: number | null;
  message: string;
  confidence: number;
};

export type AssistResult = {
  request_id: string;
  conversation_id: string;
  answer: string;
  /** Which engine produced the answer - shown honestly in the UI. */
  source: 'cloud-vlm' | 'local-llm' | 'rules';
  model: string | null;
  hazards: ServerHazard[];
  /** Mode-specific structured data (product facts, medicine fields, currency, OCR text, people...). */
  structured: Record<string, unknown> | null;
  latency_ms: number;
};

export type Capabilities = {
  version: string;
  llm: { provider: string | null; model: string | null; available: boolean; vision: boolean };
  local_llm: { available: boolean; model: string | null };
  open_vocab_detector: boolean;
  ocr: boolean;
  stt: boolean;
  faces: boolean;
  depth: boolean;
  product_lookup: boolean;
  sms_dispatch: boolean;
};

export type MemoryItem = {
  id: string;
  object: string;
  context: string | null;
  place: string | null;
  lat: number | null;
  lon: number | null;
  confidence: number;
  created_at: string;
  image_thumb_b64?: string | null;
};

export type EmergencyContact = { id: string; name: string; phone: string; relation: string | null; is_primary: boolean };

export type KnownPerson = { id: string; name: string; created_at: string; samples: number };

export type Place = { id: string; name: string; building: string | null; floor: string | null };

export type RouteStep = { instruction: string; distance_m: number; heading_deg: number | null; node_id: string; landmark: string | null };

export type RouteResult = { from_node: string; to_node: string; total_m: number; steps: RouteStep[] };
