CREATE TABLE connections (
 user_id TEXT NOT NULL, id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'NEEDS_LOGIN',
 connected INTEGER NOT NULL DEFAULT 0, credentials TEXT, generation INTEGER NOT NULL DEFAULT 0,
 last_attempt_at INTEGER, last_success_at INTEGER, expires_at INTEGER, error_code TEXT,
 lease_until INTEGER, active_snapshot_id TEXT, PRIMARY KEY(user_id,id)
);
CREATE TABLE snapshots (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT NOT NULL, as_of TEXT NOT NULL, data TEXT NOT NULL);
CREATE INDEX snapshots_user_time ON snapshots(user_id,as_of);
CREATE TABLE daily_snapshots (user_id TEXT NOT NULL, day TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(user_id,day));
CREATE TABLE auth_records (id TEXT PRIMARY KEY, kind TEXT NOT NULL, user_id TEXT, data TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX auth_expiry ON auth_records(expires_at);
CREATE INDEX auth_owner_kind ON auth_records(user_id,kind);
CREATE TABLE sync_runs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT NOT NULL, started_at INTEGER NOT NULL, duration_ms INTEGER NOT NULL, success INTEGER NOT NULL, error_code TEXT, version TEXT);
CREATE INDEX sync_user_time ON sync_runs(user_id,started_at);
CREATE TABLE rate_limits (id TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX rate_expiry ON rate_limits(expires_at);
CREATE TABLE security_state (id TEXT PRIMARY KEY, epoch INTEGER NOT NULL DEFAULT 0);
