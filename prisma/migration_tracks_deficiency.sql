-- Run in Supabase SQL Editor (safe to run more than once).
-- Adds curriculum tracks (e.g. Non-Medical / Pre-Medical) and non-credit
-- deficiency courses (e.g. Maths-I / Maths-II for pre-medical entrants).

-- Course: which track takes it (NULL = everyone), non-credit flag, weekly contact hours override.
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "trackName" TEXT;
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "isNonCredit" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "contactHours" INTEGER;

-- Student: the track they follow. Existing students become "Non-Medical".
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "track" TEXT NOT NULL DEFAULT 'Non-Medical';

-- Pass mark for deficiency courses (versioned with the other passing criteria).
ALTER TABLE "PassingCriteria" ADD COLUMN IF NOT EXISTS "deficiencyPassingPct" INTEGER NOT NULL DEFAULT 40;
