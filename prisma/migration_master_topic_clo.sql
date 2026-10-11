-- Lecture -> CLO link in the master curriculum.
ALTER TABLE "MasterCourseTopic" ADD COLUMN IF NOT EXISTS "cloNumber" INTEGER;
