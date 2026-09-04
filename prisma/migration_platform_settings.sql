-- Run in Supabase SQL Editor. Adds the PlatformSettings singleton table for
-- Super-User-only branding (institute name/logo, NCEAC logo, Lets Innovate
-- logo) shown across every page and report.

CREATE TABLE IF NOT EXISTS "PlatformSettings" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
  "instituteName" TEXT,
  "instituteLogo" TEXT,
  "ownerLogo" TEXT,
  "nceacLogo" TEXT
);
