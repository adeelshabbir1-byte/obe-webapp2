-- Run in Supabase SQL Editor. Adds the 3-tier grading module: Program
-- Coordinator's grading scale (letters + GPA values), and per-course grade
-- cutoffs set by the Instructor (or overridden by the Chairman).

CREATE TABLE IF NOT EXISTS "GradingScale" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "coordinatorId" TEXT NOT NULL REFERENCES "User"("id"),
  "letter" TEXT NOT NULL,
  "gpaValue" DOUBLE PRECISION NOT NULL,
  "orderIndex" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS "GradingScale_coordinatorId_letter_key" ON "GradingScale"("coordinatorId", "letter");
CREATE INDEX IF NOT EXISTS "GradingScale_coordinatorId_idx" ON "GradingScale"("coordinatorId");

CREATE TABLE IF NOT EXISTS "CourseGradeCutoff" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "courseId" TEXT NOT NULL REFERENCES "Course"("id"),
  "letter" TEXT NOT NULL,
  "minPercent" DOUBLE PRECISION NOT NULL,
  "setById" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CourseGradeCutoff_courseId_letter_key" ON "CourseGradeCutoff"("courseId", "letter");
CREATE INDEX IF NOT EXISTS "CourseGradeCutoff_courseId_idx" ON "CourseGradeCutoff"("courseId");
