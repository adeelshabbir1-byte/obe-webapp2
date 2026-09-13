-- Run in Supabase SQL Editor. Makes grading scales versioned by effective
-- date, so introducing a new scale (e.g. after an HEC policy change) only
-- applies to batches starting from that point on — batches already
-- running under the old scale keep their original GPA mapping.
--
-- Existing rows get effectiveFromTerm='Fall', effectiveFromYear=2000 (a
-- deliberately early default) so they keep applying to every batch that
-- already exists, exactly as before this change.

ALTER TABLE "GradingScale" ADD COLUMN IF NOT EXISTS "effectiveFromTerm" TEXT NOT NULL DEFAULT 'Fall';
ALTER TABLE "GradingScale" ADD COLUMN IF NOT EXISTS "effectiveFromYear" INTEGER NOT NULL DEFAULT 2000;

DROP INDEX IF EXISTS "GradingScale_coordinatorId_letter_key";
CREATE UNIQUE INDEX IF NOT EXISTS "GradingScale_coordinatorId_letter_effectiveFromTerm_effectiveFromYear_key"
  ON "GradingScale"("coordinatorId", "letter", "effectiveFromTerm", "effectiveFromYear");
