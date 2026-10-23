-- NCEAC portal data: a log of every NCEAC-format file downloaded from OBEHUB (who, when, program, batch, rows).
-- The portal's dropdown corrections and people's NCEAC details use the existing AAS tables (migration_aas.sql).
-- Safe to run more than once.
CREATE TABLE IF NOT EXISTS "NceacExportLog" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "program" TEXT NOT NULL,
  "batchId" TEXT,
  "batchName" TEXT,
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "rejectedCount" INTEGER NOT NULL DEFAULT 0,
  "byId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "NceacExportLog_chairmanId_createdAt_idx" ON "NceacExportLog" ("chairmanId", "createdAt");
SELECT 'done' AS result;
