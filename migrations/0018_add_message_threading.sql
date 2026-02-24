ALTER TABLE messages ADD COLUMN parent_message_id TEXT REFERENCES messages(id);
CREATE INDEX idx_messages_parent ON messages(parent_message_id);
