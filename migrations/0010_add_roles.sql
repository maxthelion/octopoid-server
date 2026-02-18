CREATE TABLE IF NOT EXISTS roles (
    name TEXT PRIMARY KEY,
    description TEXT,
    claims_from TEXT DEFAULT 'incoming',
    orchestrator_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (orchestrator_id) REFERENCES orchestrators(id)
);
