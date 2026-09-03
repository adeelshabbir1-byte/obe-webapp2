-- Run in Supabase SQL Editor. Adds the tables for HEC course-level seed
-- content (CLOs + 32-lecture topic drafts) used to auto-fill new courses.

CREATE TABLE IF NOT EXISTS "MasterCourseClo" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "masterCourseId" TEXT NOT NULL REFERENCES "MasterCourse"("id"),
  "statement" TEXT NOT NULL,
  "bloomLevel" TEXT NOT NULL,
  "orderIndex" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "MasterCourseClo_masterCourseId_idx" ON "MasterCourseClo"("masterCourseId");

CREATE TABLE IF NOT EXISTS "MasterCourseTopic" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "masterCourseId" TEXT NOT NULL REFERENCES "MasterCourse"("id"),
  "lectureNumber" INTEGER NOT NULL,
  "topic" TEXT NOT NULL,
  "subtopic" TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS "MasterCourseTopic_masterCourseId_lectureNumber_key" ON "MasterCourseTopic"("masterCourseId", "lectureNumber");
CREATE INDEX IF NOT EXISTS "MasterCourseTopic_masterCourseId_idx" ON "MasterCourseTopic"("masterCourseId");
