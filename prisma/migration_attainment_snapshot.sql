-- Run in Supabase SQL Editor. Adds the attainment snapshot table, used for
-- comparing a course's CLO/PLO pass rates against a past offering. Taken
-- automatically right before a course is re-offered — which also clears
-- that course's StudentMark and StudentEnrollment records so old and new
-- students' marks never mix together in the same view.

CREATE TABLE IF NOT EXISTS "AttainmentSnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "coordinatorId" TEXT NOT NULL,
  "courseLabel" TEXT NOT NULL,
  "termName" TEXT NOT NULL,
  "termYear" INTEGER NOT NULL,
  "studentCount" INTEGER NOT NULL,
  "cloStatsJson" TEXT NOT NULL,
  "ploStatsJson" TEXT NOT NULL,
  "histogramJson" TEXT NOT NULL,
  "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AttainmentSnapshot_coordinatorId_idx" ON "AttainmentSnapshot"("coordinatorId");
