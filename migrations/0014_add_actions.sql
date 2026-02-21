-- Add actions table for entity-bound proposals (approve/execute pattern)
CREATE TABLE actions (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    label TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'proposed',
    proposed_by TEXT NOT NULL,
    proposed_at TEXT DEFAULT (datetime('now')),
    executed_at TEXT,
    result TEXT,
    expires_at TEXT,
    metadata TEXT,
    scope TEXT NOT NULL
);

CREATE INDEX idx_actions_entity ON actions(entity_type, entity_id);
CREATE INDEX idx_actions_status ON actions(status);
CREATE INDEX idx_actions_scope ON actions(scope);
