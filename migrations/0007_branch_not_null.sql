-- Remove DEFAULT 'main' from tasks.branch, make NOT NULL.
-- Branch must be explicitly set at task creation time.
-- Existing rows with NULL branch get backfilled from 'main'.

-- SQLite/D1 doesn't support ALTER COLUMN, so we recreate the table.
CREATE TABLE tasks_new (
    id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL UNIQUE,
    queue TEXT NOT NULL DEFAULT 'incoming',
    priority TEXT DEFAULT 'P2',
    complexity TEXT,
    role TEXT,
    branch TEXT NOT NULL,
    blocked_by TEXT,
    claimed_by TEXT,
    claimed_at DATETIME,
    commits_count INTEGER DEFAULT 0,
    turns_used INTEGER,
    attempt_count INTEGER DEFAULT 0,
    has_plan BOOLEAN DEFAULT FALSE,
    plan_id TEXT,
    project_id TEXT,
    auto_accept BOOLEAN DEFAULT FALSE,
    rejection_count INTEGER DEFAULT 0,
    pr_number INTEGER,
    pr_url TEXT,
    checks TEXT,
    check_results TEXT,
    needs_rebase BOOLEAN DEFAULT FALSE,
    last_rebase_attempt_at DATETIME,
    staging_url TEXT,
    submitted_at TEXT,
    completed_at TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    orchestrator_id TEXT,
    lease_expires_at DATETIME,
    version INTEGER DEFAULT 1,
    -- Columns from migration 0002
    needs_breakdown BOOLEAN DEFAULT FALSE,
    review_round INTEGER DEFAULT 0,
    execution_notes TEXT,
    -- Columns from migrations 0003-0005
    title TEXT,
    type TEXT,
    hooks TEXT,
    -- Columns from migration 0007_add_flow_fields
    flow TEXT DEFAULT 'default',
    flow_overrides TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (orchestrator_id) REFERENCES orchestrators(id)
);

-- Copy data, backfilling NULL branches with 'main'
-- Use defaults for flow/flow_overrides since 0007_add_flow_fields may not have run yet
INSERT INTO tasks_new SELECT
    id, file_path, queue, priority, complexity, role,
    COALESCE(branch, 'main'),
    blocked_by, claimed_by, claimed_at, commits_count, turns_used,
    attempt_count, has_plan, plan_id, project_id, auto_accept,
    rejection_count, pr_number, pr_url, checks, check_results,
    needs_rebase, last_rebase_attempt_at, staging_url, submitted_at,
    completed_at, created_at, updated_at, orchestrator_id,
    lease_expires_at, version,
    needs_breakdown, review_round, execution_notes,
    title, type, hooks, 'default', NULL
FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_tasks_queue ON tasks(queue);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_claimed_by ON tasks(claimed_by);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_orchestrator_id ON tasks(orchestrator_id);
CREATE INDEX IF NOT EXISTS idx_tasks_lease_expires_at ON tasks(lease_expires_at);
CREATE INDEX IF NOT EXISTS idx_tasks_needs_breakdown ON tasks(needs_breakdown);
CREATE INDEX IF NOT EXISTS idx_tasks_title ON tasks(title);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
