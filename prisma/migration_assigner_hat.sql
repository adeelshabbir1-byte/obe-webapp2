-- Lets any teacher be given the Course Assigner role for a chosen semester.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "assignerTerm" TEXT;
