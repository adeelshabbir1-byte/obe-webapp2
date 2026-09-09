-- Run in Supabase SQL Editor. MasterCurriculum/MasterCourse/MasterPLO were
-- created outside the tracked migration files early in this project (a
-- direct schema push), so later column additions to MasterCurriculum were
-- never actually migrated. This adds anything that might be missing,
-- safely, on tables that already exist.

ALTER TABLE "MasterCurriculum" ADD COLUMN IF NOT EXISTS "sourceReference" TEXT;
ALTER TABLE "MasterCurriculum" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE "MasterCurriculum" ADD COLUMN IF NOT EXISTS "publicationDate" TIMESTAMP(3);
