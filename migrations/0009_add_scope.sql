-- Add scope column for multi-tenant entity isolation
ALTER TABLE tasks ADD COLUMN scope TEXT;
CREATE INDEX idx_tasks_scope ON tasks(scope);

ALTER TABLE projects ADD COLUMN scope TEXT;
CREATE INDEX idx_projects_scope ON projects(scope);

ALTER TABLE drafts ADD COLUMN scope TEXT;
CREATE INDEX idx_drafts_scope ON drafts(scope);
