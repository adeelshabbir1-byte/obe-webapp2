-- Run in Supabase SQL Editor. Adds Batch/cohort support: a course now
-- belongs to a specific batch, so the same curriculum can be (re-)imported
-- independently for each new intake.

CREATE TABLE IF NOT EXISTS "Batch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "coordinatorId" TEXT NOT NULL REFERENCES "User"("id"),
  "degreeProgram" TEXT NOT NULL,
  "batchName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Batch_coordinatorId_degreeProgram_batchName_key" ON "Batch"("coordinatorId", "degreeProgram", "batchName");
CREATE INDEX IF NOT EXISTS "Batch_coordinatorId_idx" ON "Batch"("coordinatorId");

ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "batchId" TEXT REFERENCES "Batch"("id");
CREATE INDEX IF NOT EXISTS "Course_batchId_idx" ON "Course"("batchId");

-- The old (coordinatorId, code) unique constraint must be replaced with one
-- that includes batchId, since the same course code can legitimately repeat
-- across different batches. Drop the old one if it exists (name may vary
-- slightly depending on how Prisma originally generated it).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Course_coordinatorId_code_key') THEN
    ALTER TABLE "Course" DROP CONSTRAINT "Course_coordinatorId_code_key";
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "Course_coordinatorId_batchId_code_key" ON "Course"("coordinatorId", "batchId", "code");
