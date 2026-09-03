-- Run in Supabase SQL Editor. Adds the extra fields needed for the Course
-- Description Form report (textbook, references, catalog description, etc.)

ALTER TABLE "Course"
  ADD COLUMN IF NOT EXISTS "textbook" TEXT,
  ADD COLUMN IF NOT EXISTS "referenceMaterial" TEXT,
  ADD COLUMN IF NOT EXISTS "catalogDescription" TEXT,
  ADD COLUMN IF NOT EXISTS "programmingAssignmentsNote" TEXT,
  ADD COLUMN IF NOT EXISTS "labInstructorName" TEXT;
