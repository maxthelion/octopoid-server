-- Add scope column to flows, replacing cluster as the key dimension
ALTER TABLE flows ADD COLUMN scope TEXT;
CREATE INDEX idx_flows_scope ON flows(scope);

-- Migrate existing rows: set scope from cluster value
UPDATE flows SET scope = cluster WHERE scope IS NULL;

-- Recreate table with (name, scope) PK (SQLite doesn't support ALTER PK)
CREATE TABLE flows_new (
  name TEXT NOT NULL,
  scope TEXT NOT NULL,
  states TEXT NOT NULL,
  transitions TEXT NOT NULL,
  registered_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (name, scope)
);

INSERT INTO flows_new (name, scope, states, transitions, registered_at, updated_at)
  SELECT name, scope, states, transitions, registered_at, updated_at FROM flows;

DROP TABLE flows;
ALTER TABLE flows_new RENAME TO flows;
CREATE INDEX idx_flows_scope_v2 ON flows(scope);
