-- Migration: Rename commits_v5 → commits
--
-- This migration removes the version suffix from the commits table.
-- Safe to run multiple times (IF EXISTS guards).
--
-- Run AFTER all application code has been updated to reference 'commits'.

-- Rename table
ALTER TABLE IF EXISTS commits_v5 RENAME TO commits;

-- Rename indexes
ALTER INDEX IF EXISTS idx_commits_v5_project RENAME TO idx_commits_project;
ALTER INDEX IF EXISTS idx_commits_v5_branch RENAME TO idx_commits_branch;
ALTER INDEX IF EXISTS idx_commits_v5_committed_at RENAME TO idx_commits_committed_at;
