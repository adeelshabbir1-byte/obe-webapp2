-- Run in Supabase SQL Editor. Adds FacultyCoursePriority — a faculty
-- member's own stated priority for teaching a course code, set on their
-- own portal and shown to Course Assigner as a color-coded hint on the
-- Section Assignment Matrix.

CREATE TABLE IF NOT EXISTS "FacultyCoursePriority" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "facultyId" TEXT NOT NULL REFERENCES "User"("id"),
  "courseCode" TEXT NOT NULL,
  "priority" INTEGER NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "FacultyCoursePriority_facultyId_courseCode_key" ON "FacultyCoursePriority"("facultyId", "courseCode");
CREATE INDEX IF NOT EXISTS "FacultyCoursePriority_facultyId_idx" ON "FacultyCoursePriority"("facultyId");
CREATE INDEX IF NOT EXISTS "FacultyCoursePriority_courseCode_idx" ON "FacultyCoursePriority"("courseCode");
