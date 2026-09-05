-- Run in Supabase SQL Editor. Adds faculty specialization tagging and the
-- assignment history snapshot table (needed since Course only tracks its
-- CURRENT offering term — this preserves prior terms' data before it gets
-- overwritten).

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "specialization" TEXT;

CREATE TABLE IF NOT EXISTS "AssignmentSnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "coordinatorId" TEXT NOT NULL,
  "courseLabel" TEXT NOT NULL,
  "courseType" TEXT NOT NULL,
  "batchLabel" TEXT NOT NULL,
  "termName" TEXT NOT NULL,
  "termYear" INTEGER NOT NULL,
  "instructorName" TEXT NOT NULL,
  "sectionCount" INTEGER NOT NULL,
  "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AssignmentSnapshot_coordinatorId_idx" ON "AssignmentSnapshot"("coordinatorId");
CREATE INDEX IF NOT EXISTS "AssignmentSnapshot_termName_termYear_idx" ON "AssignmentSnapshot"("termName", "termYear");
