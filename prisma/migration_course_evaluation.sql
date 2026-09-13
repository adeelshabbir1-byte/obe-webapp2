-- Run in Supabase SQL Editor. Adds Course.instructorObservations — the
-- free-text notes field for the Course Evaluation Form, filled in by the
-- Instructor and included in the downloadable Word document.

ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "instructorObservations" TEXT;
