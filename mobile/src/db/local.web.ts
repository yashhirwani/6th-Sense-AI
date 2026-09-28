import { Asset } from 'expo-asset';
import initSqlJs, { type Database, type SqlValue } from 'sql.js';
import { MIGRATIONS } from './schema';

/**
 * Web preview database: SQLite compiled to WebAssembly (sql.js), synchronous like expo-sqlite's sync
 * API but without needing SharedArrayBuffer / cross-origin isolation. Persisted to localStorage.
 * Exposes the subset of the expo-sqlite API the app uses (execSync, runSync, getAllSync, getFirstSync).
 */
const STORAGE_KEY = 'sixthsense.db';
let raw: Database | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

type Params = SqlValue[];

function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!raw) return;
    try {
      const bytes = raw.export();
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      localStorage.setItem(STORAGE_KEY, btoa(bin));
    } catch {
      /* storage full / unavailable: the data stays in memory for this session */
    }
  }, 300);
}

function flat(params: unknown[]): Params {
  return (params.length === 1 && Array.isArray(params[0]) ? params[0] : params) as Params;
}

function rows<T>(sql: string, params: Params): T[] {
  const stmt = raw!.prepare(sql);
  try {
    stmt.bind(params);
    const out: T[] = [];
    while (stmt.step()) out.push(stmt.getAsObject() as T);
    return out;
  } finally {
    stmt.free();
  }
}

const api = {
  execSync(sql: string) {
    raw!.exec(sql);
    persist();
  },
  runSync(sql: string, ...params: unknown[]) {
    raw!.run(sql, flat(params));
    persist();
    return { changes: raw!.getRowsModified(), lastInsertRowId: 0 };
  },
  getAllSync<T>(sql: string, ...params: unknown[]): T[] {
    return rows<T>(sql, flat(params));
  },
  getFirstSync<T>(sql: string, ...params: unknown[]): T | null {
    return rows<T>(sql, flat(params))[0] ?? null;
  },
};

export type LocalDb = typeof api;

/** Must complete before first use (called from the root layout). */
export async function initLocalDb(): Promise<void> {
  if (raw) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const wasmUrl = Asset.fromModule(require('sql.js/dist/sql-wasm.wasm')).uri;
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const saved = localStorage.getItem(STORAGE_KEY);
  raw = saved ? new SQL.Database(Uint8Array.from(atob(saved), (c) => c.charCodeAt(0))) : new SQL.Database();
  raw.exec('PRAGMA foreign_keys = ON;');
  let version = (rows<{ user_version: number }>('PRAGMA user_version', [])[0]?.user_version as number) ?? 0;
  while (version < MIGRATIONS.length) {
    raw.exec(MIGRATIONS[version]);
    version += 1;
    raw.exec(`PRAGMA user_version = ${version}`);
  }
  persist();
}

export function getDb(): LocalDb {
  if (!raw) throw new Error('Local database not initialised yet.');
  return api;
}

export function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function wipeLocalData() {
  api.execSync('DELETE FROM memories; DELETE FROM scans; DELETE FROM hazard_log; DELETE FROM emergency_events; DELETE FROM emergency_contacts;');
}
