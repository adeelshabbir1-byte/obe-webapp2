-- HEC HEMIS export: the institute's and each program's HEMIS codes, and a log of every HEMIS file downloaded.
-- Safe to run more than once.
CREATE TABLE IF NOT EXISTS "HemisCode" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "program" TEXT NOT NULL DEFAULT '',
  "code" TEXT NOT NULL,
  "level" TEXT,
  "discipline" TEXT,
  "years" INTEGER,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "HemisCode_chairmanId_program_key" ON "HemisCode" ("chairmanId", "program");
CREATE TABLE IF NOT EXISTS "HemisExportLog" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "dataset" TEXT NOT NULL,
  "rows" INTEGER NOT NULL DEFAULT 0,
  "rejected" INTEGER NOT NULL DEFAULT 0,
  "byId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "HemisExportLog_chairmanId_createdAt_idx" ON "HemisExportLog" ("chairmanId", "createdAt");
SELECT 'done' AS result;
