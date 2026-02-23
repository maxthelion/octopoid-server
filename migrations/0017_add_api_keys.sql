-- Add api_keys table for scope-scoped authentication
CREATE TABLE api_keys (
    key_hash TEXT PRIMARY KEY,
    scope TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now')),
    last_used_at TEXT
);

CREATE INDEX idx_api_keys_scope ON api_keys(scope);
