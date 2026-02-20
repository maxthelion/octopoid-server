-- Add scope column to orchestrators for multi-tenant isolation
-- NOTE: ALTER TABLE skipped as column was already applied to production.
-- New databases get the column from the base schema.
CREATE INDEX IF NOT EXISTS idx_orchestrators_scope ON orchestrators(scope);
