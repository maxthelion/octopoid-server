-- Add scope column to orchestrators for multi-tenant isolation
ALTER TABLE orchestrators ADD COLUMN scope TEXT;
CREATE INDEX IF NOT EXISTS idx_orchestrators_scope ON orchestrators(scope);
