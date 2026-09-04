-- Run in Supabase SQL Editor. Adds the Student/Enrollment/Marks system for
-- the Result Mate report and repeat/summer course offerings.

ALTER TABLE "AssessmentInstrument" ADD COLUMN IF NOT EXISTS "maxScore" INTEGER NOT NULL DEFAULT 10;

CREATE TABLE IF NOT EXISTS "Student" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "batchId" TEXT NOT NULL REFERENCES "Batch"("id"),
  "name" TEXT NOT NULL,
  "rollNumber" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Student_batchId_rollNumber_key" ON "Student"("batchId", "rollNumber");
CREATE INDEX IF NOT EXISTS "Student_batchId_idx" ON "Student"("batchId");

CREATE TABLE IF NOT EXISTS "StudentEnrollment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "studentId" TEXT NOT NULL REFERENCES "Student"("id"),
  "courseId" TEXT NOT NULL REFERENCES "Course"("id"),
  "isRepeat" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "StudentEnrollment_studentId_courseId_key" ON "StudentEnrollment"("studentId", "courseId");
CREATE INDEX IF NOT EXISTS "StudentEnrollment_courseId_idx" ON "StudentEnrollment"("courseId");
CREATE INDEX IF NOT EXISTS "StudentEnrollment_studentId_idx" ON "StudentEnrollment"("studentId");

CREATE TABLE IF NOT EXISTS "StudentMark" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "studentId" TEXT NOT NULL REFERENCES "Student"("id"),
  "courseId" TEXT NOT NULL REFERENCES "Course"("id"),
  "instrumentId" TEXT NOT NULL REFERENCES "AssessmentInstrument"("id"),
  "score" DOUBLE PRECISION NOT NULL,
  "enteredById" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "StudentMark_studentId_instrumentId_key" ON "StudentMark"("studentId", "instrumentId");
CREATE INDEX IF NOT EXISTS "StudentMark_courseId_idx" ON "StudentMark"("courseId");
CREATE INDEX IF NOT EXISTS "StudentMark_studentId_idx" ON "StudentMark"("studentId");
