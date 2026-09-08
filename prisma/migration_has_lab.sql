-- Run in Supabase SQL Editor. Adds hasLab to Course — when false, Lab %
-- is locked to 0 in weight-setting (Weight Policy compliance checks skip
-- the lab category for these courses too).

ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "hasLab" BOOLEAN NOT NULL DEFAULT true;
