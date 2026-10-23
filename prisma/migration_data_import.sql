-- Data Import hub: one log row per import, with the ids it created (for undo).
CREATE TABLE IF NOT EXISTS "ImportLog" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "targetJson" TEXT NOT NULL DEFAULT '{}',
  "rows" INTEGER NOT NULL DEFAULT 0,
  "created" INTEGER NOT NULL DEFAULT 0,
  "skipped" INTEGER NOT NULL DEFAULT 0,
  "createdIdsJson" TEXT NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'DONE',
  "byId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "undoneAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "ImportLog_chairmanId_createdAt_idx" ON "ImportLog"("chairmanId","createdAt");

-- Student alert choices: which kinds of SMS / WhatsApp / email a student receives, and the guardian's weekly summary.
CREATE TABLE IF NOT EXISTS "StudentAlertPref" (
  "studentId" TEXT PRIMARY KEY,
  "offJson" TEXT NOT NULL DEFAULT '[]',
  "parentWeekly" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
