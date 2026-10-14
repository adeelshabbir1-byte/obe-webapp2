-- Course-to-PLO weightage: how much each course counts toward a PLO of its batch. New table only.
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
SELECT 'done' AS result;
