-- Add messages table for actor-model message passing
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    from_actor TEXT NOT NULL,
    to_actor TEXT,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    scope TEXT
);

CREATE INDEX idx_messages_task ON messages(task_id, created_at);
CREATE INDEX idx_messages_to ON messages(to_actor, created_at);
CREATE INDEX idx_messages_scope ON messages(scope);
