import * as SQLite from 'expo-sqlite';
import { MIGRATIONS } from './schema';

/**
 * On-device database. Keeps the assistant useful offline and lets the user's own data live on the
 * phone first; the backend receives copies only when cloud processing is enabled.
 */
let db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (db) return db;
  db = SQLite.openDatabaseSync('sixthsense.db');
  db.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    db.execSync(MIGRATIONS[version]);
    version += 1;
    db.execSync(`PRAGMA user_version = ${version}`);
  }
  return db;
}

/** Native opens the database lazily; nothing to prepare. */
export async function initLocalDb(): Promise<void> {}

export function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Privacy: wipe everything stored on this device. */
export function wipeLocalData() {
  const d = getDb();
  d.execSync('DELETE FROM memories; DELETE FROM scans; DELETE FROM hazard_log; DELETE FROM emergency_events; DELETE FROM emergency_contacts;');
}
