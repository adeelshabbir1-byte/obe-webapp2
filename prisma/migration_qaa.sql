-- HEC QAA self-assessment cycle of a program: Program Team -> SAR -> Assessment Team visit and report ->
-- implementation plan -> progress tracking. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "QaaCycle" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "program" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "ptFormedAt" TIMESTAMP(3),
  "sarDueAt" TIMESTAMP(3),
  "sarSubmittedAt" TIMESTAMP(3),
  "atVisitAt" TIMESTAMP(3),
  "atReportAt" TIMESTAMP(3),
  "planApprovedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "programTeamJson" TEXT NOT NULL DEFAULT '[]',
  "assessmentTeamJson" TEXT NOT NULL DEFAULT '[]',
  "documentsJson" TEXT NOT NULL DEFAULT '[]',
  "atSummary" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "QaaCycle_chairmanId_idx" ON "QaaCycle" ("chairmanId");
CREATE TABLE IF NOT EXISTS "QaaAction" (
  "id" TEXT PRIMARY KEY,
  "cycleId" TEXT NOT NULL,
  "finding" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "ownerId" TEXT,
  "dueDate" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "progressPct" INTEGER NOT NULL DEFAULT 0,
  "progressNote" TEXT,
  "doneAt" TIMESTAMP(3),
  "lastRemindedOn" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "QaaAction_cycleId_idx" ON "QaaAction" ("cycleId");
SELECT 'done' AS result;
