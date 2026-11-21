CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, owner_hash TEXT UNIQUE NOT NULL, revision INTEGER NOT NULL,
  mode TEXT NOT NULL, epoch TEXT NOT NULL, closed INTEGER NOT NULL DEFAULT 0,
  expires INTEGER NOT NULL, changed INTEGER NOT NULL, document TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires);
CREATE TABLE IF NOT EXISTS links (
  code TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL, epoch TEXT NOT NULL, player TEXT NOT NULL DEFAULT '',
  UNIQUE(session_id, role, epoch, player)
);
CREATE TABLE IF NOT EXISTS limits (
  bucket TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS limit_expiry ON limits(expires);
