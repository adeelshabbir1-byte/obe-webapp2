-- Run in Supabase SQL Editor. Adds PaperDistributionItem — the final/
-- mid-term exam question distribution, built by SE (planning) or
-- Instructor (actual exam), with each question optionally linked back to
-- a real lecture topic so its CLO and cognitive level come from actual
-- course data.

CREATE TABLE IF NOT EXISTS "PaperDistributionItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "courseId" TEXT NOT NULL REFERENCES "Course"("id"),
  "source" TEXT NOT NULL DEFAULT 'SE',
  "questionNo" INTEGER NOT NULL,
  "lectureRowId" TEXT REFERENCES "LectureRow"("id"),
  "topicText" TEXT NOT NULL,
  "cloId" TEXT REFERENCES "CLO"("id"),
  "cognitiveLevel" TEXT,
  "marks" DOUBLE PRECISION NOT NULL,
  "orderIndex" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PaperDistributionItem_courseId_idx" ON "PaperDistributionItem"("courseId");
