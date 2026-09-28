import { getDb, newId } from '@/db/local';

export type ScanKind = 'document' | 'product' | 'currency' | 'medicine';
export type ScanRow = { id: string; kind: ScanKind; title: string | null; text: string | null; data: string | null; created_at: number };

/** Local history of reads/scans (Scan screen "Recent"). */
export function saveScan(kind: ScanKind, title: string | null, text: string | null, data: unknown) {
  getDb().runSync(
    'INSERT INTO scans (id, kind, title, text, data, created_at) VALUES (?,?,?,?,?,?)',
    newId(), kind, title, text, data == null ? null : JSON.stringify(data), Date.now(),
  );
}

export function recentScans(limit = 20): ScanRow[] {
  return getDb().getAllSync<ScanRow>('SELECT * FROM scans ORDER BY created_at DESC LIMIT ?', limit);
}

export function deleteScan(id: string) {
  getDb().runSync('DELETE FROM scans WHERE id = ?', id);
}
