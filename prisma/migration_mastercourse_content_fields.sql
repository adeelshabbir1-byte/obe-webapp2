-- Run in Supabase SQL Editor. Adds textbook/catalogDescription/
-- referenceMaterial to MasterCourse — these now flow into every Course
-- created from this template on import, same as CLOs already do,
-- instead of starting empty every time.

ALTER TABLE "MasterCourse" ADD COLUMN IF NOT EXISTS "textbook" TEXT;
ALTER TABLE "MasterCourse" ADD COLUMN IF NOT EXISTS "catalogDescription" TEXT;
ALTER TABLE "MasterCourse" ADD COLUMN IF NOT EXISTS "referenceMaterial" TEXT;
