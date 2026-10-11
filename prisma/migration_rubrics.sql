-- Marking rubrics for assessment items, with CLO per criterion, and per-student rubric marking.
CREATE TABLE IF NOT EXISTS "Rubric" (
  "id" TEXT PRIMARY KEY,
  "instrumentId" TEXT NOT NULL UNIQUE,
  "courseId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "criteriaJson" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Rubric_courseId_idx" ON "Rubric"("courseId");
CREATE TABLE IF NOT EXISTS "RubricScore" (
  "id" TEXT PRIMARY KEY,
  "rubricId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "levelsJson" TEXT NOT NULL,
  "comment" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("rubricId", "studentId")
);
CREATE INDEX IF NOT EXISTS "RubricScore_rubricId_idx" ON "RubricScore"("rubricId");
