-- Cohort PLO change per approved course result. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "PloChangeLog" (
  "id" TEXT PRIMARY KEY, "batchId" TEXT NOT NULL, "courseId" TEXT NOT NULL, "courseCode" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3) NOT NULL, "deltasJson" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "PloChangeLog_courseId_key" ON "PloChangeLog" ("courseId");
CREATE INDEX IF NOT EXISTS "PloChangeLog_batchId_idx" ON "PloChangeLog" ("batchId");
SELECT 'done' AS result;
