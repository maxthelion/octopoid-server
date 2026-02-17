-- Migration: Re-add flow fields dropped by 0007_branch_not_null table recreation

ALTER TABLE tasks ADD COLUMN flow TEXT DEFAULT 'default';
ALTER TABLE tasks ADD COLUMN flow_overrides TEXT;
