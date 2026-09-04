-- Run in Supabase SQL Editor. Adds the per-Chairman institute logo field
-- (each paying tenant institution has its own name/logo, set only by the
-- Super User). Note: PlatformSettings.instituteName/instituteLogo columns
-- from an earlier migration are now unused (superseded by this per-Chairman
-- approach) — harmless to leave, no code references them.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "instituteLogo" TEXT;
