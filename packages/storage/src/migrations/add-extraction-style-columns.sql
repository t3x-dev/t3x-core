-- Add extraction_style columns to projects and users tables
-- Part of extraction style settings feature

ALTER TABLE projects ADD COLUMN extraction_style jsonb;
ALTER TABLE users ADD COLUMN default_extraction_style jsonb;
