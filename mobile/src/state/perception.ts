import { create } from 'zustand';
import type { Detection, Hazard } from '@/services/perception/types';

export type DetectorState = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';

type PerceptionState = {
  detectorState: DetectorState;
  detectorError: string | null;
  cameraActive: boolean;
  /** Latest tracked detections (already converted to bearing / approx distance). */
  detections: Detection[];
  hazards: Hazard[];
  /** Measured on-device inference rate. */
  fps: number;
  lastUpdate: number;
  /** Android ambient light sensor (lux); null when unsupported (e.g. iOS). */
  lux: number | null;

  setDetector: (state: DetectorState, error?: string | null) => void;
  setCameraActive: (active: boolean) => void;
  setResults: (detections: Detection[], hazards: Hazard[], fps: number) => void;
  setLux: (lux: number | null) => void;
};

export const usePerception = create<PerceptionState>()((set) => ({
  detectorState: 'idle',
  detectorError: null,
  cameraActive: false,
  detections: [],
  hazards: [],
  fps: 0,
  lastUpdate: 0,
  lux: null,

  setDetector: (detectorState, detectorError = null) => set({ detectorState, detectorError }),
  setCameraActive: (cameraActive) => set(cameraActive ? { cameraActive } : { cameraActive, detections: [], fps: 0 }),
  setResults: (detections, hazards, fps) => set({ detections, hazards, fps, lastUpdate: Date.now() }),
  setLux: (lux) => set({ lux }),
}));

export const perceptionStore = usePerception;
