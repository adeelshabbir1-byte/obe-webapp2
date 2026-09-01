-- Run in Supabase SQL Editor. Adds AssessmentInstrument (quizzes, assignments,
-- midterm/final questions each with their own marks%) and the many-to-many
-- link table between lecture rows and instruments (the checkbox matrix).

CREATE TABLE IF NOT EXISTS "AssessmentInstrument" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "courseId" TEXT NOT NULL REFERENCES "Course"("id"),
  "type" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "marksPct" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AssessmentInstrument_courseId_idx" ON "AssessmentInstrument"("courseId");

CREATE TABLE IF NOT EXISTS "LectureRowInstrument" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "lectureRowId" TEXT NOT NULL REFERENCES "LectureRow"("id"),
  "instrumentId" TEXT NOT NULL REFERENCES "AssessmentInstrument"("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LectureRowInstrument_lectureRowId_instrumentId_key" ON "LectureRowInstrument"("lectureRowId", "instrumentId");
CREATE INDEX IF NOT EXISTS "LectureRowInstrument_lectureRowId_idx" ON "LectureRowInstrument"("lectureRowId");
CREATE INDEX IF NOT EXISTS "LectureRowInstrument_instrumentId_idx" ON "LectureRowInstrument"("instrumentId");
