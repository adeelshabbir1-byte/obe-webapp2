-- Run in Supabase SQL Editor. Adds minimum-assessment-count fields to the
-- weight policy (e.g. "at least 3 quizzes, 2 assignments").

ALTER TABLE "WeightPolicy"
  ADD COLUMN IF NOT EXISTS "assignmentMinCount" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "quizMinCount" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "projectMinCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "labMinCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "midtermMinCount" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "finalMinCount" INTEGER NOT NULL DEFAULT 1;
