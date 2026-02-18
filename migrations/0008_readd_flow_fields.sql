-- Migration: Re-add flow fields dropped by 0007_branch_not_null table recreation
-- NOTE: These columns are now included in 0007_branch_not_null.sql table recreation.
-- This migration is kept as a no-op for migration history consistency.
SELECT 1;
