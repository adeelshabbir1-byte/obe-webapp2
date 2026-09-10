-- Run in Supabase SQL Editor. Adds StudentTranscriptRecord — a permanent
-- per-student, per-course-offering snapshot of grade and CLO/PLO
-- attainment, taken right before that course's marks get wiped on
-- re-offering, so individual transcripts survive across every semester.

CREATE TABLE IF NOT EXISTS "StudentTranscriptRecord" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "studentId" TEXT NOT NULL REFERENCES "Student"("id"),
  "coordinatorId" TEXT NOT NULL,
  "courseCode" TEXT NOT NULL,
  "courseTitle" TEXT NOT NULL,
  "creditHours" INTEGER NOT NULL,
  "courseType" TEXT NOT NULL,
  "termName" TEXT NOT NULL,
  "termYear" INTEGER NOT NULL,
  "totalPct" DOUBLE PRECISION NOT NULL,
  "grade" TEXT NOT NULL,
  "gpaPoints" DOUBLE PRECISION,
  "cloAttainmentJson" TEXT NOT NULL,
  "ploAttainmentJson" TEXT NOT NULL,
  "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "StudentTranscriptRecord_studentId_idx" ON "StudentTranscriptRecord"("studentId");
CREATE INDEX IF NOT EXISTS "StudentTranscriptRecord_coordinatorId_idx" ON "StudentTranscriptRecord"("coordinatorId");
