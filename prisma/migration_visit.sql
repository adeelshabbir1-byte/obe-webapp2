-- Accreditation visit day: agenda, panel, logistics and findings. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "VisitItem" ("id" TEXT PRIMARY KEY, "cycleId" TEXT NOT NULL, "kind" TEXT NOT NULL, "sort" INTEGER NOT NULL DEFAULT 0, "dataJson" TEXT NOT NULL DEFAULT '{}', "status" TEXT NOT NULL DEFAULT 'OPEN', "ownerId" TEXT, "dueDate" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "VisitItem_cycleId_kind_idx" ON "VisitItem" ("cycleId", "kind");
SELECT 'done' AS result;
