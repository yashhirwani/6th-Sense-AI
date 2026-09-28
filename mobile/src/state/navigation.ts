import { create } from 'zustand';
import type { Place, RouteResult } from '@/services/api/types';

export type LocalizationMethod = 'qr' | 'apriltag' | 'gps';

type NavState = {
  place: Place | null;
  node: { id: string; name: string } | null;
  method: LocalizationMethod | null;
  lockedAt: number | null;
  destination: string | null;
  route: RouteResult | null;
  stepIndex: number;
  /** metres walked on the current step (pedometer) */
  stepProgressM: number;
  /** metres walked on the whole route */
  walkedM: number;
  active: boolean;
  /** latest compass heading (deg, magnetic) */
  heading: number | null;
  lastCue: string | null;
  outdoor: { street: string | null; heading: number | null; at: number } | null;
  set: (p: Partial<Omit<NavState, 'set'>>) => void;
};

export const useNavigation = create<NavState>()((set) => ({
  place: null,
  node: null,
  method: null,
  lockedAt: null,
  destination: null,
  route: null,
  stepIndex: 0,
  stepProgressM: 0,
  walkedM: 0,
  active: false,
  heading: null,
  lastCue: null,
  outdoor: null,
  set: (p) => set(p),
}));

export const navigationStore = useNavigation;
