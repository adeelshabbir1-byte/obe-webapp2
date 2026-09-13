-- Run in Supabase SQL Editor. Adds the full attendance system:
-- per-lecture, per-student attendance marking, and an institution-wide
-- minimum attendance % threshold used to flag students falling short.

CREATE TABLE IF NOT EXISTS "AttendanceRecord" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "courseId" TEXT NOT NULL REFERENCES "Course"("id"),
  "lectureRowId" TEXT NOT NULL REFERENCES "LectureRow"("id"),
  "studentId" TEXT NOT NULL REFERENCES "Student"("id"),
  "status" TEXT NOT NULL,
  "markedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceRecord_lectureRowId_studentId_key" ON "AttendanceRecord"("lectureRowId", "studentId");
CREATE INDEX IF NOT EXISTS "AttendanceRecord_courseId_idx" ON "AttendanceRecord"("courseId");
CREATE INDEX IF NOT EXISTS "AttendanceRecord_studentId_idx" ON "AttendanceRecord"("studentId");

CREATE TABLE IF NOT EXISTS "AttendanceThreshold" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "chairmanId" TEXT NOT NULL UNIQUE,
  "minPercentage" INTEGER NOT NULL DEFAULT 75
);
