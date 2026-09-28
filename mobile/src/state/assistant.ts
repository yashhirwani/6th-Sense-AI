import { create } from 'zustand';

/** Drives the Home "Listening / Processing / Speaking" pill, the header AI badge and the orb. */
export type AssistantStatus = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export type ChatTurn = { id: string; role: 'user' | 'assistant'; text: string; at: number; source?: 'device' | 'cloud' | 'local-llm' };

export type SpokenEntry = {
  id: string;
  text: string;
  at: number;
  /** 'info' narration, or a hazard severity. */
  kind: 'info' | 'caution' | 'warning' | 'critical';
  /** Where the related thing is, for the spoken-log "Binaural 3D Left" line. */
  direction?: 'left' | 'front' | 'right' | 'back';
};

type AssistantState = {
  status: AssistantStatus;
  /** Live partial speech-to-text while listening. */
  partialTranscript: string;
  conversation: ChatTurn[];
  spokenLog: SpokenEntry[];
  lastError: string | null;
  /** Backend reachability: null = unknown yet. */
  backendOnline: boolean | null;
  /** Which models the backend reports as loaded (GET /v1/capabilities). */
  capabilities: Record<string, boolean>;

  setStatus: (s: AssistantStatus) => void;
  setPartial: (t: string) => void;
  addTurn: (t: Omit<ChatTurn, 'id' | 'at'>) => void;
  logSpoken: (e: Omit<SpokenEntry, 'id' | 'at'>) => void;
  setError: (e: string | null) => void;
  setBackend: (online: boolean, capabilities?: Record<string, boolean>) => void;
  clearConversation: () => void;
};

let seq = 0;
const nextId = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

export const useAssistant = create<AssistantState>()((set) => ({
  status: 'idle',
  partialTranscript: '',
  conversation: [],
  spokenLog: [],
  lastError: null,
  backendOnline: null,
  capabilities: {},

  setStatus: (status) => set({ status }),
  setPartial: (partialTranscript) => set({ partialTranscript }),
  addTurn: (t) => set((s) => ({ conversation: [...s.conversation.slice(-49), { ...t, id: nextId(), at: Date.now() }] })),
  logSpoken: (e) => set((s) => ({ spokenLog: [{ ...e, id: nextId(), at: Date.now() }, ...s.spokenLog].slice(0, 50) })),
  setError: (lastError) => set({ lastError }),
  setBackend: (backendOnline, capabilities) =>
    set((s) => ({ backendOnline, capabilities: capabilities ?? s.capabilities })),
  clearConversation: () => set({ conversation: [] }),
}));

export const assistantStore = useAssistant;
