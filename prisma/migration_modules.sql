-- Module licensing: which modules each institute has switched off (no row = everything on). Safe to run more than once.
CREATE TABLE IF NOT EXISTS "InstituteLicense" ("chairmanId" TEXT PRIMARY KEY, "lockedJson" TEXT NOT NULL DEFAULT '[]', "packageKey" TEXT, "note" TEXT, "validUntil" TIMESTAMP(3), "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
SELECT 'done' AS result;
