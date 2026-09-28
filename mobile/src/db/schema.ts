/** Local database schema, shared by the native (expo-sqlite) and web (sql.js) implementations. */
export const MIGRATIONS: string[] = [
  // v1
  `
  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY NOT NULL,
    object TEXT NOT NULL,
    context TEXT,
    place TEXT,
    lat REAL,
    lon REAL,
    confidence REAL NOT NULL DEFAULT 1,
    source TEXT NOT NULL DEFAULT 'auto',       -- 'auto' (seen by camera) | 'user' (asked to remember)
    created_at INTEGER NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_memories_object ON memories(object);
  CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);

  CREATE TABLE IF NOT EXISTS scans (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL,                        -- document | product | currency | medicine
    title TEXT,
    text TEXT,
    data TEXT,                                 -- JSON structured result
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS hazard_log (
    id TEXT PRIMARY KEY NOT NULL,
    label TEXT NOT NULL,
    severity TEXT NOT NULL,
    message TEXT NOT NULL,
    lat REAL,
    lon REAL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS emergency_contacts (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    relation TEXT,
    is_primary INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS emergency_events (
    id TEXT PRIMARY KEY NOT NULL,
    trigger TEXT NOT NULL,                     -- fall | voice | manual
    status TEXT NOT NULL,                      -- cancelled | dispatched | failed
    detail TEXT,
    lat REAL,
    lon REAL,
    created_at INTEGER NOT NULL
  );
  `,
];
