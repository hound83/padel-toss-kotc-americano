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

CREATE TABLE IF NOT EXISTS organizer_logins (
  token TEXT PRIMARY KEY, expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS organizer_login_expiry ON organizer_logins(expires);

CREATE TABLE IF NOT EXISTS signup_series (
  id TEXT PRIMARY KEY, salt TEXT NOT NULL, verifier TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS signup_polls (
  id TEXT PRIMARY KEY, series TEXT NOT NULL REFERENCES signup_series(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL, expires INTEGER NOT NULL, document TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS signup_expiry ON signup_polls(expires);
CREATE TABLE IF NOT EXISTS signup_logins (
  token TEXT PRIMARY KEY, series TEXT NOT NULL REFERENCES signup_series(id) ON DELETE CASCADE, expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS signup_holds (
  series TEXT NOT NULL REFERENCES signup_series(id) ON DELETE CASCADE, format TEXT NOT NULL, name TEXT NOT NULL, person TEXT,
  PRIMARY KEY(series,format,name)
);
