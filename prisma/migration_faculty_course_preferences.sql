-- Run in Supabase SQL Editor. Adds FacultyCoursePreference — a faculty
-- member's own stated interest in teaching a course code, set on their
-- own portal ("Course Preferences") and shown to Course Assigner as a
-- color-coded hint on the Section Assignment Matrix.

CREATE TABLE IF NOT EXISTS "FacultyCoursePreference" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "facultyId" TEXT NOT NULL REFERENCES "User"("id"),
  "courseCode" TEXT NOT NULL,
  "priority" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "FacultyCoursePreference_facultyId_courseCode_key" ON "FacultyCoursePreference"("facultyId", "courseCode");
CREATE INDEX IF NOT EXISTS "FacultyCoursePreference_facultyId_idx" ON "FacultyCoursePreference"("facultyId");
CREATE INDEX IF NOT EXISTS "FacultyCoursePreference_courseCode_idx" ON "FacultyCoursePreference"("courseCode");
