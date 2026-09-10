-- Run in Supabase SQL Editor. Adds targetPct to CLO — the faculty-set %
-- of students expected to attain each CO, used by the new Program
-- Attainment Analytics dashboard (target vs actual, NBA-style levels).

ALTER TABLE "CLO" ADD COLUMN IF NOT EXISTS "targetPct" INTEGER NOT NULL DEFAULT 60;
