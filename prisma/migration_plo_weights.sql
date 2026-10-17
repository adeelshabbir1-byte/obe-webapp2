-- Outcome weights: how much each course counts toward a PLO of its batch, and how much each PLO counts toward a PEO
-- of its program. New tables only.
CREATE TABLE IF NOT EXISTS "CoursePloWeight" (
  "id" TEXT PRIMARY KEY,
  "batchId" TEXT NOT NULL,
  "ploId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "weightPct" DOUBLE PRECISION NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CoursePloWeight_courseId_ploId_key" ON "CoursePloWeight"("courseId", "ploId");
CREATE INDEX IF NOT EXISTS "CoursePloWeight_batchId_idx" ON "CoursePloWeight"("batchId");
CREATE INDEX IF NOT EXISTS "CoursePloWeight_ploId_idx" ON "CoursePloWeight"("ploId");
CREATE TABLE IF NOT EXISTS "ProgramPeoWeight" (
  "id" TEXT PRIMARY KEY,
  "coordinatorId" TEXT NOT NULL,
  "degreeProgram" TEXT NOT NULL,
  "peoIndex" INTEGER NOT NULL,
  "ploNumber" INTEGER NOT NULL,
  "weightPct" DOUBLE PRECISION NOT NULL,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProgramPeoWeight_coordinatorId_degreeProgram_peoIndex_ploNumber_key" ON "ProgramPeoWeight"("coordinatorId", "degreeProgram", "peoIndex", "ploNumber");
CREATE INDEX IF NOT EXISTS "ProgramPeoWeight_coordinatorId_degreeProgram_idx" ON "ProgramPeoWeight"("coordinatorId", "degreeProgram");
SELECT 'done' AS result;
