import { create } from 'zustand';

export type EmergencyPhase = 'idle' | 'countdown' | 'dispatching' | 'dispatched' | 'cancelled' | 'failed';
export type EmergencyTrigger = 'fall' | 'voice' | 'manual';

type EmergencyState = {
  phase: EmergencyPhase;
  trigger: EmergencyTrigger | null;
  secondsLeft: number;
  total: number;
  /** Human-readable outcome ("SMS sent to Sarah", "No contacts configured"...). */
  detail: string | null;
  impactG: number | null;
  set: (p: Partial<Omit<EmergencyState, 'set'>>) => void;
};

export const useEmergency = create<EmergencyState>()((set) => ({
  phase: 'idle',
  trigger: null,
  secondsLeft: 0,
  total: 8,
  detail: null,
  impactG: null,
  set: (p) => set(p),
}));

export const emergencyStore = useEmergency;
