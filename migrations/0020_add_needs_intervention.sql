-- Add needs_intervention flag for message-based intervention model.
-- Tasks stay in their current queue but get flagged for fixer attention.
ALTER TABLE tasks ADD COLUMN needs_intervention INTEGER DEFAULT 0;
