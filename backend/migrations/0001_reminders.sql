PRAGMA foreign_keys = ON;

-- A credential hash and revision tombstone survive unsubscribe for 30 days.
-- This prevents a delayed PUT from undoing a newer DELETE.
CREATE TABLE installations (
  id TEXT PRIMARY KEY,
  credential_hash TEXT NOT NULL,
  revision INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_test_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE subscriptions (
  installation_id TEXT PRIMARY KEY REFERENCES installations(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  endpoint_hash TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  time TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  current_day_eligible INTEGER NOT NULL CHECK(current_day_eligible IN (0, 1)),
  completed_local_date TEXT,
  observed_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX subscriptions_expiry ON subscriptions(expires_at);

-- Independent of installation lifecycle and timezone: one scheduled attempt
-- per actual subscription per local date, including disable/re-enable.
CREATE TABLE deliveries (
  endpoint_hash TEXT NOT NULL,
  local_date TEXT NOT NULL,
  claimed_at INTEGER NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'claimed',
  PRIMARY KEY(endpoint_hash, local_date)
);

CREATE TABLE rate_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
