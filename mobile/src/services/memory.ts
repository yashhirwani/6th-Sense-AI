import { getDb, newId } from '@/db/local';
import { getSettings } from '@/state/settings';
import { api } from './api/client';
import type { MemoryItem } from './api/types';
import { getFix, placeName } from './location';
import type { Detection } from './perception/types';

export type LocalMemory = {
  id: string;
  object: string;
  context: string | null;
  place: string | null;
  lat: number | null;
  lon: number | null;
  confidence: number;
  source: 'auto' | 'user';
  created_at: number;
  synced: number;
};

/** Personal items worth remembering automatically when the camera sees them (COCO names). */
const AUTO_OBJECTS = new Set(['backpack', 'handbag', 'phone', 'laptop', 'book', 'umbrella', 'suitcase', 'bottle', 'cup', 'remote', 'keyboard', 'computer mouse', 'scissors', 'clock']);
const AUTO_MIN_CONF = 0.6;
const AUTO_COOLDOWN_MS = 2 * 60 * 1000;
const lastAuto = new Map<string, number>();

function normalize(s: string) {
  return s.toLowerCase().replace(/^(my|the|a|an)\s+/, '').replace(/s$/, '').trim();
}

export async function remember(object: string, context: string | null, source: 'auto' | 'user', confidence = 1): Promise<LocalMemory> {
  const fix = await getFix(3000);
  const place = fix ? await placeName(fix) : null;
  const m: LocalMemory = {
    id: newId(),
    object: normalize(object),
    context,
    place,
    lat: fix?.lat ?? null,
    lon: fix?.lon ?? null,
    confidence,
    source,
    created_at: Date.now(),
    synced: 0,
  };
  getDb().runSync(
    'INSERT INTO memories (id, object, context, place, lat, lon, confidence, source, created_at, synced) VALUES (?,?,?,?,?,?,?,?,?,0)',
    m.id, m.object, m.context, m.place, m.lat, m.lon, m.confidence, m.source, m.created_at,
  );
  void syncMemory(m);
  return m;
}

async function syncMemory(m: LocalMemory) {
  if (!getSettings().cloudProcessing) return;
  try {
    await api('/v1/memories', {
      method: 'POST',
      body: { id: m.id, object: m.object, context: m.context, place: m.place, lat: m.lat, lon: m.lon, confidence: m.confidence, source: m.source, created_at: new Date(m.created_at).toISOString() },
    });
    getDb().runSync('UPDATE memories SET synced = 1 WHERE id = ?', m.id);
  } catch {
    // stays unsynced; retried by syncPending()
  }
}

export async function syncPending() {
  const rows = getDb().getAllSync<LocalMemory>('SELECT * FROM memories WHERE synced = 0 ORDER BY created_at LIMIT 50');
  for (const r of rows) await syncMemory(r);
}

/** Automatic observations from the live detector (throttled per object). */
export function observe(dets: Detection[]) {
  if (!getSettings().memoryEnabled) return;
  const now = Date.now();
  for (const d of dets) {
    if (!AUTO_OBJECTS.has(d.name) || d.confidence < AUTO_MIN_CONF || d.age < 5) continue;
    if (now - (lastAuto.get(d.name) ?? 0) < AUTO_COOLDOWN_MS) continue;
    lastAuto.set(d.name, now);
    const side = d.bearing === 'front' ? 'in front of you' : `on your ${d.bearing}`;
    void remember(d.name, `seen by the camera ${side}`, 'auto', d.confidence);
  }
}

/**
 * Most relevant observation for "where is my X". Local exact/partial matches first (works offline);
 * then the server's semantic search (e.g. "purse" -> "handbag") when available.
 */
export async function recall(target: string): Promise<LocalMemory | null> {
  const q = normalize(target);
  const db = getDb();
  const exact = db.getFirstSync<LocalMemory>('SELECT * FROM memories WHERE object = ? ORDER BY source = \'user\' DESC, created_at DESC LIMIT 1', q);
  if (exact) return exact;
  const like = db.getFirstSync<LocalMemory>('SELECT * FROM memories WHERE object LIKE ? OR context LIKE ? ORDER BY created_at DESC LIMIT 1', `%${q}%`, `%${q}%`);
  if (like) return like;
  if (!getSettings().cloudProcessing) return null;
  try {
    const res = await api<MemoryItem[]>(`/v1/memories/search?q=${encodeURIComponent(target)}&limit=1`);
    const r = res[0];
    if (!r) return null;
    return { id: r.id, object: r.object, context: r.context, place: r.place, lat: r.lat, lon: r.lon, confidence: r.confidence, source: 'user', created_at: Date.parse(r.created_at), synced: 1 };
  } catch {
    return null;
  }
}

export function listMemories(limit = 200): LocalMemory[] {
  return getDb().getAllSync<LocalMemory>('SELECT * FROM memories ORDER BY created_at DESC LIMIT ?', limit);
}

export async function deleteMemory(id: string) {
  getDb().runSync('DELETE FROM memories WHERE id = ?', id);
  try {
    await api(`/v1/memories/${id}`, { method: 'DELETE' });
  } catch {
    /* offline: server copy (if any) is removed by "delete all my data" */
  }
}

export async function deleteAllMemories() {
  getDb().runSync('DELETE FROM memories');
  try {
    await api('/v1/memories', { method: 'DELETE' });
  } catch {
    /* ignore */
  }
}

export function relativeTime(ts: number, now = Date.now()): string {
  const s = Math.round((now - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

export function describeMemory(m: LocalMemory): string {
  const when = relativeTime(m.created_at);
  const how = m.source === 'user' ? 'you asked me to remember it' : 'I saw it with the camera';
  const where = [m.context, m.place ? `near ${m.place}` : null].filter(Boolean).join(', ');
  return `Your ${m.object} was last noted ${when}${where ? `: ${where}` : ''}. ${how.charAt(0).toUpperCase() + how.slice(1)}.`;
}
