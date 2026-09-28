export type Bearing = 'left' | 'front' | 'right';
export type Severity = 'safe' | 'caution' | 'warning' | 'critical';

/** Normalised box in the upright (portrait) image: 0..1, origin top-left. */
export type Box = { x: number; y: number; w: number; h: number };

export type RawDetection = { classId: number; score: number; box: Box };

export type Detection = {
  /** Stable track id across frames. */
  id: number;
  label: string;
  /** Human-friendly singular noun, e.g. "chair". */
  name: string;
  icon: string;
  confidence: number;
  box: Box;
  bearing: Bearing;
  /** Horizontal angle from the optical axis in degrees (negative = left). */
  angleDeg: number;
  /** 12-hour clock direction (9 = hard left, 12 = ahead, 3 = hard right). */
  clock: number;
  /** Approximate distance in metres from a pinhole model + typical object size; null when unreliable. */
  distanceM: number | null;
  /** Relative growth of the box per second (>0 = getting closer). */
  approachRate: number;
  /** Frames this track has been seen. */
  age: number;
};

export type Hazard = {
  id: string;
  trackId?: number;
  label: string;
  title: string;
  severity: Severity;
  bearing: Bearing;
  clock: number;
  distanceM: number | null;
  approaching: boolean;
  /** Short spoken directive, e.g. "Stop. Car approaching on your left." */
  message: string;
  source: 'device' | 'server';
  at: number;
};
