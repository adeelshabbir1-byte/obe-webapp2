-- Run in Supabase SQL Editor. Upgrades TimetableRun to support background,
-- resumable generation: a run can now sit in RUNNING/STOPPED status with
-- its best-so-far chromosome saved between polling calls, instead of only
-- ever being a single-shot COMPLETED/FAILED result.

ALTER TABLE "TimetableRun" ALTER COLUMN "status" SET DEFAULT 'RUNNING';
ALTER TABLE "TimetableRun" ADD COLUMN IF NOT EXISTS "bestChromosomeJson" TEXT;
ALTER TABLE "TimetableRun" ADD COLUMN IF NOT EXISTS "targetEndTime" TIMESTAMP(3);
ALTER TABLE "TimetableRun" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
