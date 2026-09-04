-- Run in Supabase SQL Editor. Covers: degree-wide semester dates, lecture
-- reschedule tracking, institute branding, and OMC change attribution.

CREATE TABLE IF NOT EXISTS "SemesterDates" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "coordinatorId" TEXT NOT NULL REFERENCES "User"("id"),
  "degreeProgram" TEXT NOT NULL,
  "termName" TEXT NOT NULL,
  "termYear" INTEGER NOT NULL,
  "semesterStartDate" TIMESTAMP(3),
  "midtermDate" TIMESTAMP(3),
  "finalDate" TIMESTAMP(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "SemesterDates_coordinatorId_degreeProgram_termName_termYear_key" ON "SemesterDates"("coordinatorId", "degreeProgram", "termName", "termYear");
CREATE INDEX IF NOT EXISTS "SemesterDates_coordinatorId_idx" ON "SemesterDates"("coordinatorId");

ALTER TABLE "LectureRow" ADD COLUMN IF NOT EXISTS "rescheduledNote" TEXT;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "instituteName" TEXT;

ALTER TABLE "WeightPolicy" ADD COLUMN IF NOT EXISTS "updatedById" TEXT;
ALTER TABLE "CourseEquivalenceGroup" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "CqiRecord" ADD COLUMN IF NOT EXISTS "lastUpdatedById" TEXT;
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "templateReviewedById" TEXT;
