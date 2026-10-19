-- Accreditation process tracker (NCEAC Manual Figure 1): status and dates of each step per visit cycle. Safe to rerun.
CREATE TABLE IF NOT EXISTS "AccreditationStep" (
  "id" TEXT NOT NULL, "cycleId" TEXT NOT NULL, "stepKey" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
  "doneOn" TIMESTAMP(3), "expectedOn" TIMESTAMP(3), "note" TEXT, "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccreditationStep_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AccreditationStep_cycleId_stepKey_key" ON "AccreditationStep"("cycleId", "stepKey");
