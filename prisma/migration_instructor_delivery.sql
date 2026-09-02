-- Run in Supabase SQL Editor. Adds the Instructor Delivery system: prerequisite
-- course links, feed-forward notes, OMC-Instructor guidance threads, the
-- Instructor's own weight fields, and "source" tagging (SE vs INSTRUCTOR) on
-- CLO, LectureRow, and AssessmentInstrument so each role's data stays separate.

ALTER TABLE "Course"
  ADD COLUMN IF NOT EXISTS "prerequisiteCourseId" TEXT REFERENCES "Course"("id"),
  ADD COLUMN IF NOT EXISTS "instructorAssignmentPct" INTEGER,
  ADD COLUMN IF NOT EXISTS "instructorQuizPct" INTEGER,
  ADD COLUMN IF NOT EXISTS "instructorProjectPct" INTEGER,
  ADD COLUMN IF NOT EXISTS "instructorLabPct" INTEGER,
  ADD COLUMN IF NOT EXISTS "instructorMidtermPct" INTEGER,
  ADD COLUMN IF NOT EXISTS "instructorFinalPct" INTEGER;
CREATE INDEX IF NOT EXISTS "Course_prerequisiteCourseId_idx" ON "Course"("prerequisiteCourseId");

CREATE TABLE IF NOT EXISTS "FeedForwardNote" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "courseId" TEXT NOT NULL REFERENCES "Course"("id"),
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "FeedForwardNote_courseId_idx" ON "FeedForwardNote"("courseId");

CREATE TABLE IF NOT EXISTS "InstructorGuidanceComment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "courseId" TEXT NOT NULL REFERENCES "Course"("id"),
  "authorId" TEXT NOT NULL,
  "authorRole" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "InstructorGuidanceComment_courseId_idx" ON "InstructorGuidanceComment"("courseId");

-- Add "source" to CLO, and replace its old unique index with one that
-- includes source (so SE's and the Instructor's CLO codes don't collide).
ALTER TABLE "CLO" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'SE';
DROP INDEX IF EXISTS "CLO_courseId_code_key";
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'CLO' AND con.contype = 'u'
      AND (SELECT array_agg(a.attname ORDER BY a.attnum)::text[] FROM pg_attribute a WHERE a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)) = ARRAY['courseId','code']::text[]
  LOOP EXECUTE format('ALTER TABLE "CLO" DROP CONSTRAINT %I', r.conname); END LOOP;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "CLO_courseId_source_code_key" ON "CLO"("courseId", "source", "code");

-- Add "source" and "actualDate" to LectureRow, same treatment for its unique index.
ALTER TABLE "LectureRow"
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'SE',
  ADD COLUMN IF NOT EXISTS "actualDate" TIMESTAMP(3);
DROP INDEX IF EXISTS "LectureRow_courseId_lectureNumber_key";
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'LectureRow' AND con.contype = 'u'
      AND (SELECT array_agg(a.attname ORDER BY a.attnum)::text[] FROM pg_attribute a WHERE a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)) = ARRAY['courseId','lectureNumber']::text[]
  LOOP EXECUTE format('ALTER TABLE "LectureRow" DROP CONSTRAINT %I', r.conname); END LOOP;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "LectureRow_courseId_source_lectureNumber_key" ON "LectureRow"("courseId", "source", "lectureNumber");

-- Add "source" to AssessmentInstrument (no unique index on it originally, so nothing to drop/replace).
ALTER TABLE "AssessmentInstrument" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'SE';
