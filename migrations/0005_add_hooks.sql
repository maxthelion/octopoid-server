-- Add hooks column for server-enforced hook tracking
-- Stores JSON array of hook objects: [{"name": "...", "point": "...", "type": "...", "status": "..."}]
ALTER TABLE tasks ADD COLUMN hooks TEXT;
