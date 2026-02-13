-- Migration: Change drafts table to use auto-incrementing integer IDs
-- The old table used TEXT PRIMARY KEY with client-supplied IDs.
-- The new table uses INTEGER PRIMARY KEY AUTOINCREMENT so the server assigns IDs.

-- Step 1: Rename old table
ALTER TABLE drafts RENAME TO drafts_old;

-- Step 2: Create new table with integer ID
CREATE TABLE drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'idea',
    author TEXT NOT NULL,
    domain TEXT,
    file_path TEXT,
    created_at TEXT,
    updated_at TEXT,
    linked_task_id TEXT,
    linked_project_id TEXT,
    tags TEXT
);

-- Step 3: Copy existing data (id column is dropped, new integer IDs assigned)
INSERT INTO drafts (title, status, author, domain, file_path, created_at, updated_at, linked_task_id, linked_project_id, tags)
SELECT title, status, author, domain, file_path, created_at, updated_at, linked_task_id, linked_project_id, tags
FROM drafts_old
ORDER BY created_at ASC;

-- Step 4: Drop old table
DROP TABLE drafts_old;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);
CREATE INDEX IF NOT EXISTS idx_drafts_author ON drafts(author);
CREATE INDEX IF NOT EXISTS idx_drafts_domain ON drafts(domain);
