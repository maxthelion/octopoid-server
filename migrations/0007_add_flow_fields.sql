-- Migration: Add flow fields to tasks table
-- Adds flow and flow_overrides columns for declarative flows system

ALTER TABLE tasks ADD COLUMN flow TEXT DEFAULT 'default';
ALTER TABLE tasks ADD COLUMN flow_overrides TEXT;
