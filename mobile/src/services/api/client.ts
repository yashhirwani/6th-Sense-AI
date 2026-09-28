import { fetch } from 'expo/fetch';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { assistantStore } from '@/state/assistant';
import { secureStorage } from '../secureStorage';
import { getSettings } from '@/state/settings';
import { parseSse } from './sse';
import type { AssistRequest, AssistResult, Capabilities } from './types';

const TOKEN_KEY = 'sixthsense.token';
const DEVICE_KEY = 'sixthsense.device';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

const baseUrl = () => getSettings().backendUrl.replace(/\/+$/, '');

async function deviceId(): Promise<string> {
  let id = await secureStorage.get(DEVICE_KEY);
  if (!id) {
    id = Crypto.randomUUID();
    await secureStorage.set(DEVICE_KEY, id);
  }
  return id;
}

let tokenCache: string | null = null;

/** Device-bound auth: the backend issues a JWT for this install; no password is ever typed. */
async function token(force = false): Promise<string> {
  if (!force) {
    tokenCache ??= await secureStorage.get(TOKEN_KEY);
    if (tokenCache) return tokenCache;
  }
  const res = await fetch(`${baseUrl()}/v1/auth/device`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: await deviceId(), platform: Platform.OS }),
  });
  if (!res.ok) throw new ApiError(`Auth failed (${res.status})`, res.status);
  const json = (await res.json()) as { token: string };
  tokenCache = json.token;
  await secureStorage.set(TOKEN_KEY, json.token);
  return json.token;
}

export async function clearAuth() {
  tokenCache = null;
  await secureStorage.remove(TOKEN_KEY);
}

type RequestOpts = { method?: string; body?: unknown; timeoutMs?: number; signal?: AbortSignal };

/** JSON request with auth, timeout and a single re-auth retry on 401. */
export async function api<T>(path: string, { method = 'GET', body, timeoutMs = 20000, signal }: RequestOpts = {}): Promise<T> {
  const attempt = async (retry: boolean): Promise<T> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    signal?.addEventListener('abort', () => ctrl.abort());
    try {
      const res = await fetch(`${baseUrl()}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (res.status === 401 && retry) {
        await token(true);
        return attempt(false);
      }
      if (!res.ok) {
        let detail = `Request failed (${res.status})`;
        try {
          const j = (await res.json()) as { detail?: string };
          if (j.detail) detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
        } catch {
          /* non-JSON error */
        }
        throw new ApiError(detail, res.status);
      }
      assistantStore.getState().setBackend(true);
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      assistantStore.getState().setBackend(false);
      throw new ApiError(ctrl.signal.aborted ? 'The server took too long to respond.' : 'Cannot reach the 6th Sense server.', 0, 'network');
    } finally {
      clearTimeout(timer);
    }
  };
  return attempt(true);
}

/** Health + capabilities probe; updates the header "Online" status. */
export async function probeBackend(): Promise<Capabilities | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${baseUrl()}/v1/capabilities`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(String(res.status));
    const caps = (await res.json()) as Capabilities;
    assistantStore.getState().setBackend(true, {
      llm: caps.llm.available,
      vision: caps.llm.vision,
      localLlm: caps.local_llm.available,
      openVocab: caps.open_vocab_detector,
      ocr: caps.ocr,
      stt: caps.stt,
      faces: caps.faces,
      depth: caps.depth,
      product: caps.product_lookup,
      sms: caps.sms_dispatch,
    });
    return caps;
  } catch {
    assistantStore.getState().setBackend(false);
    return null;
  }
}

/**
 * POST /v1/assist with Server-Sent Events: `delta` events carry answer text as it is generated so
 * speech can start on the first sentence; the final `result` event carries the full AssistResult.
 */
export async function assistStream(
  req: AssistRequest,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<AssistResult> {
  const res = await fetch(`${baseUrl()}/v1/assist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: `Bearer ${await token()}` },
    body: JSON.stringify(req),
    signal,
  }).catch(() => {
    assistantStore.getState().setBackend(false);
    throw new ApiError('Cannot reach the 6th Sense server.', 0, 'network');
  });
  if (res.status === 401) {
    await token(true);
    return assistStream(req, onDelta, signal);
  }
  if (!res.ok || !res.body) {
    let detail = `Assist failed (${res.status})`;
    try {
      detail = ((await res.json()) as { detail?: string }).detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(detail, res.status);
  }
  assistantStore.getState().setBackend(true);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let result: AssistResult | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const ev = parseSse(raw);
      if (!ev) continue;
      if (ev.event === 'delta') onDelta((JSON.parse(ev.data) as { text: string }).text);
      else if (ev.event === 'result') result = JSON.parse(ev.data) as AssistResult;
      else if (ev.event === 'error') throw new ApiError((JSON.parse(ev.data) as { detail: string }).detail, 500);
    }
  }
  if (!result) throw new ApiError('The server ended the response early.', 502);
  return result;
}
