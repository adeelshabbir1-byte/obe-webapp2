-- Run this in Supabase's SQL Editor (Database icon in left sidebar → SQL Editor → New query).
-- This adds the tables/columns needed for the Subject Expert's CLO / 30-lecture
-- schedule / assessment weights feature, matching the updated prisma/schema.prisma.

ALTER TABLE "Course"
  ADD COLUMN IF NOT EXISTS "templateStatus" TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS "assignmentPct" INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS "quizPct" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS "projectPct" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "labPct" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "midtermPct" INTEGER NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS "finalPct" INTEGER NOT NULL DEFAULT 40;

CREATE TABLE IF NOT EXISTS "CLO" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "courseId" TEXT NOT NULL REFERENCES "Course"("id"),
  "code" TEXT NOT NULL,
  "statement" TEXT NOT NULL,
  "bloomLevel" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'CLO' AND column_name = 'source') THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS "CLO_courseId_code_key" ON "CLO"("courseId", "code")';
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "CLO_courseId_idx" ON "CLO"("courseId");

CREATE TABLE IF NOT EXISTS "LectureRow" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "courseId" TEXT NOT NULL REFERENCES "Course"("id"),
  "week" INTEGER NOT NULL,
  "lectureNumber" INTEGER NOT NULL,
  "topic" TEXT NOT NULL,
  "subtopic" TEXT,
  "cloId" TEXT REFERENCES "CLO"("id"),
  "bloomLevel" TEXT,
  "weightPct" INTEGER NOT NULL DEFAULT 0
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'LectureRow' AND column_name = 'source') THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS "LectureRow_courseId_lectureNumber_key" ON "LectureRow"("courseId", "lectureNumber")';
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "LectureRow_courseId_idx" ON "LectureRow"("courseId");
-- Run in Supabase SQL Editor. Replaces the direct-to-HEC PLO mapping with
-- proper institutional PLOs: defined by the Program Coordinator, approved by
-- the Chairman, and it's these that CLOs map to.

CREATE TABLE IF NOT EXISTS "PLO" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "coordinatorId" TEXT NOT NULL REFERENCES "User"("id"),
  "number" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "sourceMasterPloNumber" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "chairmanComment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PLO_coordinatorId_idx" ON "PLO"("coordinatorId");
CREATE UNIQUE INDEX IF NOT EXISTS "PLO_batchId_number_key" ON "PLO"("batchId", "number");

-- Drop the old HEC-number-based column on CLO and add the new PLO reference.
ALTER TABLE "CLO" DROP COLUMN IF EXISTS "mappedPloNumber";
ALTER TABLE "CLO" ADD COLUMN IF NOT EXISTS "mappedPloId" TEXT REFERENCES "PLO"("id");
-- Run in Supabase SQL Editor. Adds the OMC review comment field to Course.
-- Note: no change needed for the OMC role itself — "OMC" was already part
-- of the UserRole enum type from your very first database setup, so
-- creating OMC accounts will work without any additional migration here.

ALTER TABLE "Course"
  ADD COLUMN IF NOT EXISTS "omcComment" TEXT;
-- Run in Supabase SQL Editor. Adds:
--   1. courseType and semesterNumber columns on Course
--   2. the CoursePloMapping table (the OMC's PLO-Course matrix)

ALTER TABLE "Course"
  ADD COLUMN IF NOT EXISTS "courseType" TEXT NOT NULL DEFAULT 'Core',
  ADD COLUMN IF NOT EXISTS "semesterNumber" INTEGER;

CREATE TABLE IF NOT EXISTS "CoursePloMapping" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "courseId" TEXT NOT NULL REFERENCES "Course"("id"),
  "ploId" TEXT NOT NULL REFERENCES "PLO"("id"),
  "assignedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CoursePloMapping_courseId_ploId_key" ON "CoursePloMapping"("courseId", "ploId");
CREATE INDEX IF NOT EXISTS "CoursePloMapping_courseId_idx" ON "CoursePloMapping"("courseId");
CREATE INDEX IF NOT EXISTS "CoursePloMapping_ploId_idx" ON "CoursePloMapping"("ploId");
-- Run in Supabase SQL Editor. Adds Batch/cohort support: a course now
-- belongs to a specific batch, so the same curriculum can be (re-)imported
-- independently for each new intake.

CREATE TABLE IF NOT EXISTS "Batch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "coordinatorId" TEXT NOT NULL REFERENCES "User"("id"),
  "degreeProgram" TEXT NOT NULL,
  "batchName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Batch_coordinatorId_degreeProgram_batchName_key" ON "Batch"("coordinatorId", "degreeProgram", "batchName");
CREATE INDEX IF NOT EXISTS "Batch_coordinatorId_idx" ON "Batch"("coordinatorId");

ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "batchId" TEXT REFERENCES "Batch"("id");
CREATE INDEX IF NOT EXISTS "Course_batchId_idx" ON "Course"("batchId");

-- The old (coordinatorId, code) unique constraint must be replaced with one
-- that includes batchId, since the same course code can legitimately repeat
-- across different batches. Drop the old one if it exists (name may vary
-- slightly depending on how Prisma originally generated it).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Course_coordinatorId_code_key') THEN
    ALTER TABLE "Course" DROP CONSTRAINT "Course_coordinatorId_code_key";
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "Course_coordinatorId_batchId_code_key" ON "Course"("coordinatorId", "batchId", "code");
-- Run in Supabase SQL Editor. MasterCourse.semesterNumber needs to allow NULL
-- (some courses, like open electives, don't have a fixed semester).

ALTER TABLE "MasterCourse" ALTER COLUMN "semesterNumber" DROP NOT NULL;
-- Run in Supabase SQL Editor. Adds the CLO-to-PLO contribution percentage.

ALTER TABLE "CLO" ADD COLUMN IF NOT EXISTS "ploContributionPct" INTEGER;
-- Run in Supabase SQL Editor. Adds the OMC Weight Policy system and the
-- exception-approval workflow for out-of-range Subject Expert weights.

CREATE TABLE IF NOT EXISTS "WeightPolicy" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "chairmanId" TEXT NOT NULL REFERENCES "User"("id"),
  "courseType" TEXT NOT NULL,
  "assignmentMin" INTEGER NOT NULL DEFAULT 0,
  "assignmentMax" INTEGER NOT NULL DEFAULT 100,
  "quizMin" INTEGER NOT NULL DEFAULT 0,
  "quizMax" INTEGER NOT NULL DEFAULT 100,
  "projectMin" INTEGER NOT NULL DEFAULT 0,
  "projectMax" INTEGER NOT NULL DEFAULT 100,
  "labMin" INTEGER NOT NULL DEFAULT 0,
  "labMax" INTEGER NOT NULL DEFAULT 100,
  "midtermMin" INTEGER NOT NULL DEFAULT 0,
  "midtermMax" INTEGER NOT NULL DEFAULT 100,
  "finalMin" INTEGER NOT NULL DEFAULT 0,
  "finalMax" INTEGER NOT NULL DEFAULT 100,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "WeightPolicy_chairmanId_courseType_key" ON "WeightPolicy"("chairmanId", "courseType");
CREATE INDEX IF NOT EXISTS "WeightPolicy_chairmanId_idx" ON "WeightPolicy"("chairmanId");

CREATE TABLE IF NOT EXISTS "WeightExceptionRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "courseId" TEXT NOT NULL REFERENCES "Course"("id"),
  "requestedById" TEXT NOT NULL,
  "assignmentPct" INTEGER NOT NULL,
  "quizPct" INTEGER NOT NULL,
  "projectPct" INTEGER NOT NULL,
  "labPct" INTEGER NOT NULL,
  "midtermPct" INTEGER NOT NULL,
  "finalPct" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "omcComment" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "WeightExceptionRequest_courseId_key" ON "WeightExceptionRequest"("courseId");
CREATE INDEX IF NOT EXISTS "WeightExceptionRequest_courseId_idx" ON "WeightExceptionRequest"("courseId");
-- Run in Supabase SQL Editor. Adds the self-referencing benchmark lineage
-- field so a new batch's course can trace back to which prior offering it
-- was pre-filled from.

ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "benchmarkSourceId" TEXT REFERENCES "Course"("id");
CREATE INDEX IF NOT EXISTS "Course_benchmarkSourceId_idx" ON "Course"("benchmarkSourceId");
-- Run in Supabase SQL Editor. Adds minimum-assessment-count fields to the
-- weight policy (e.g. "at least 3 quizzes, 2 assignments").

ALTER TABLE "WeightPolicy"
  ADD COLUMN IF NOT EXISTS "assignmentMinCount" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "quizMinCount" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "projectMinCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "labMinCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "midtermMinCount" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "finalMinCount" INTEGER NOT NULL DEFAULT 1;
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
-- Run in Supabase SQL Editor. Adds batch start-term tracking, the current-term
-- setting, and course offering/instructor assignment fields.

ALTER TABLE "Batch"
  ADD COLUMN IF NOT EXISTS "startTerm" TEXT NOT NULL DEFAULT 'Fall',
  ADD COLUMN IF NOT EXISTS "startYear" INTEGER NOT NULL DEFAULT 2025;

CREATE TABLE IF NOT EXISTS "CurrentTerm" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "coordinatorId" TEXT NOT NULL UNIQUE REFERENCES "User"("id"),
  "termName" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "Course"
  ADD COLUMN IF NOT EXISTS "instructorId" TEXT REFERENCES "User"("id"),
  ADD COLUMN IF NOT EXISTS "isOffered" BOOLEAN NOT NULL DEFAULT false;
-- Run in Supabase SQL Editor. The User.role column is a genuine PostgreSQL
-- enum type (not plain text, as an earlier migration's comment incorrectly
-- assumed) — this actually adds COURSE_ASSIGNER as a valid value.

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'COURSE_ASSIGNER';
-- Run in Supabase SQL Editor. Adds faculty load tracking, the
-- CourseSectionAssignment matrix table, and the COURSE_ASSIGNER role
-- (role is stored as text, so no enum change needed at the DB level).

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "normalLoad" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "externalLoadCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "externalLoadNote" TEXT;

CREATE TABLE IF NOT EXISTS "CourseSectionAssignment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "courseId" TEXT NOT NULL REFERENCES "Course"("id"),
  "instructorId" TEXT NOT NULL REFERENCES "User"("id"),
  "sectionCount" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CourseSectionAssignment_courseId_instructorId_key" ON "CourseSectionAssignment"("courseId", "instructorId");
CREATE INDEX IF NOT EXISTS "CourseSectionAssignment_courseId_idx" ON "CourseSectionAssignment"("courseId");
CREATE INDEX IF NOT EXISTS "CourseSectionAssignment_instructorId_idx" ON "CourseSectionAssignment"("instructorId");
-- Run in Supabase SQL Editor. Adds batch student counts and the course
-- equivalence group system (combining courses across batches/programs).

ALTER TABLE "Batch" ADD COLUMN IF NOT EXISTS "studentCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "CourseEquivalenceGroup" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "chairmanId" TEXT NOT NULL REFERENCES "User"("id"),
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CourseEquivalenceGroup_chairmanId_idx" ON "CourseEquivalenceGroup"("chairmanId");

CREATE TABLE IF NOT EXISTS "CourseEquivalenceMember" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "groupId" TEXT NOT NULL REFERENCES "CourseEquivalenceGroup"("id"),
  "courseId" TEXT NOT NULL UNIQUE REFERENCES "Course"("id")
);
CREATE INDEX IF NOT EXISTS "CourseEquivalenceMember_groupId_idx" ON "CourseEquivalenceMember"("groupId");

CREATE TABLE IF NOT EXISTS "GroupSectionAssignment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "groupId" TEXT NOT NULL REFERENCES "CourseEquivalenceGroup"("id"),
  "instructorId" TEXT NOT NULL REFERENCES "User"("id"),
  "sectionCount" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "GroupSectionAssignment_groupId_instructorId_key" ON "GroupSectionAssignment"("groupId", "instructorId");
CREATE INDEX IF NOT EXISTS "GroupSectionAssignment_groupId_idx" ON "GroupSectionAssignment"("groupId");
CREATE INDEX IF NOT EXISTS "GroupSectionAssignment_instructorId_idx" ON "GroupSectionAssignment"("instructorId");
-- Run in Supabase SQL Editor. Adds term tracking to Course, needed for the
-- Teacher Load Report to know which semester a section assignment belongs to.

ALTER TABLE "Course"
  ADD COLUMN IF NOT EXISTS "offeredTermName" TEXT,
  ADD COLUMN IF NOT EXISTS "offeredTermYear" INTEGER;
-- Run in Supabase SQL Editor. This was an INTERMEDIATE step (PLO scoped by
-- coordinator+degreeProgram) later superseded by migration_plo_batch_scope.sql
-- (PLO scoped by batch directly). Wrapped so it's a safe no-op if the
-- database has already moved past this stage (degreeProgram column gone).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PLO' AND column_name = 'degreeProgram') THEN

    -- Backfill: where a coordinator has exactly one distinct degree program
    -- across their batches, assume existing PLOs belong to it.
    UPDATE "PLO" p
    SET "degreeProgram" = sub.only_degree
    FROM (
      SELECT "coordinatorId", MIN("degreeProgram") AS only_degree
      FROM "Batch"
      GROUP BY "coordinatorId"
      HAVING COUNT(DISTINCT "degreeProgram") = 1
    ) sub
    WHERE p."coordinatorId" = sub."coordinatorId" AND p."degreeProgram" = '';

  END IF;
END $$;

-- Drop whatever the old (coordinatorId, number) unique constraint/index is
-- called, as either a formal constraint or a plain index — safe even if
-- already gone.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'PLO' AND con.contype = 'u'
      AND (
        SELECT array_agg(a.attname ORDER BY a.attnum)::text[]
        FROM pg_attribute a
        WHERE a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
      ) = ARRAY['coordinatorId','number']::text[]
  LOOP
    EXECUTE format('ALTER TABLE "PLO" DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
DROP INDEX IF EXISTS "PLO_coordinatorId_number_key";

-- Only (re)create the intermediate degreeProgram-based unique index if that
-- column still exists — once batch_scope has dropped it, this must NOT run,
-- since duplicate (coordinatorId, degreeProgram, number) rows now legitimately
-- exist across different batches of the same degree.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PLO' AND column_name = 'degreeProgram') THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS "PLO_coordinatorId_degreeProgram_number_key" ON "PLO"("coordinatorId", "degreeProgram", "number")';
  END IF;
END $$;

-- Add COURSE_ASSIGNER to the UserRole enum if it's somehow still missing
-- (the IF NOT EXISTS clause makes this safe to run again even if already applied).
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'COURSE_ASSIGNER';
-- Run in Supabase SQL Editor. Re-scopes PLO from (coordinator + degreeProgram)
-- to (batch) directly — since even two cohorts of the same degree can have
-- different PLOs.
--
-- IMPORTANT: the backfill below is a best-effort guess (it picks the most
-- recently created batch matching each PLO's old degreeProgram, when a
-- coordinator has more than one batch for that degree). After running this,
-- go to Coordinator → Program Learning Outcomes for each batch and confirm
-- the PLOs landed on the right one — move/recreate any that didn't.

ALTER TABLE "PLO" ADD COLUMN IF NOT EXISTS "batchId" TEXT;

-- Only attempt the backfill if degreeProgram still exists (skip cleanly if
-- this migration already completed in an earlier run).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PLO' AND column_name = 'degreeProgram') THEN
    UPDATE "PLO" p
    SET "batchId" = sub.batch_id
    FROM (
      SELECT DISTINCT ON (b."coordinatorId", b."degreeProgram")
        b."coordinatorId", b."degreeProgram", b.id AS batch_id
      FROM "Batch" b
      ORDER BY b."coordinatorId", b."degreeProgram", b."createdAt" DESC
    ) sub
    WHERE p."coordinatorId" = sub."coordinatorId" AND p."degreeProgram" = sub."degreeProgram" AND p."batchId" IS NULL;
  END IF;
END $$;

-- Drop the old (coordinatorId, degreeProgram, number) unique constraint/index,
-- whatever it's actually called.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'PLO' AND con.contype = 'u'
      AND (
        SELECT array_agg(a.attname ORDER BY a.attnum)::text[]
        FROM pg_attribute a
        WHERE a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
      ) = ARRAY['coordinatorId','degreeProgram','number']::text[]
  LOOP
    EXECUTE format('ALTER TABLE "PLO" DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
DROP INDEX IF EXISTS "PLO_coordinatorId_degreeProgram_number_key";

-- Drop the now-unused degreeProgram column and enforce the new scoping.
ALTER TABLE "PLO" DROP COLUMN IF EXISTS "degreeProgram";
CREATE UNIQUE INDEX IF NOT EXISTS "PLO_batchId_number_key" ON "PLO"("batchId", "number");

-- Any PLO that still has no batchId (e.g. its coordinator had zero matching
-- batches somehow) is orphaned — this just reports how many, doesn't delete them.
SELECT count(*) AS plos_still_missing_a_batch FROM "PLO" WHERE "batchId" IS NULL;
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
-- Run in Supabase SQL Editor. Backfills CLO and lecture-topic seed content
-- onto the 14 Major HEC courses already in your database (matched by code),
-- skipping any course that already has this content.

-- CS-101
DO $$
DECLARE mc_id TEXT;
BEGIN
  SELECT id INTO mc_id FROM "MasterCourse" WHERE code = 'CS-101' LIMIT 1;
  IF mc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MasterCourseClo" WHERE "masterCourseId" = mc_id) THEN
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Demonstrate proficiency in writing, debugging, and executing basic programs using programming languages such as C or Python.', 'C3', 0);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Explain core programming concepts including variables, control structures, functions, and data types.', 'C2', 1);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Develop simple algorithms to solve computational problems.', 'C3', 2);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Apply best practices in coding to produce efficient and readable programs.', 'C3', 3);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Analyze program outputs and troubleshoot common errors effectively.', 'C4', 4);
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 1, 'Introduction to Computers & Programming');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 2, 'Problem Solving & Algorithms');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 3, 'Introduction to C++ Syntax');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 4, 'Variables & Data Types');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 5, 'Operators & Expressions');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 6, 'Input/Output Statements');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 7, 'Conditional Statements (if-else)');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 8, 'Switch Statements');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 9, 'Loops - while');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 10, 'Loops - for');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 11, 'Loops - do-while');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 12, 'Nested Loops');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 13, 'Functions - Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 14, 'Function Parameters & Return Values');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 15, 'Recursion Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 16, 'Arrays - 1D');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 17, 'Arrays - 2D');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 18, 'String Handling');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 19, 'Pointers - Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 20, 'Pointers & Arrays');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 21, 'Dynamic Memory Allocation');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 22, 'Structures');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 23, 'File Handling - Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 24, 'File Handling - Read/Write');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 25, 'Introduction to Classes & Objects');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 26, 'Constructors & Destructors');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 27, 'Function Overloading');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 28, 'Introduction to Inheritance');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 29, 'Debugging Techniques');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 30, 'Code Optimization Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 31, 'Review & Practice Problems');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 32, 'Final Project Presentation');
  END IF;
END $$;

-- CS-102
DO $$
DECLARE mc_id TEXT;
BEGIN
  SELECT id INTO mc_id FROM "MasterCourse" WHERE code = 'CS-102' LIMIT 1;
  IF mc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MasterCourseClo" WHERE "masterCourseId" = mc_id) THEN
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Understand and apply the principles of object-oriented programming, including encapsulation, inheritance, and polymorphism.', 'C2', 0);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Design and implement classes and objects to model real-world entities.', 'C5', 1);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Write reusable and modular code using OOP concepts.', 'C3', 2);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Analyze the advantages of OOP over procedural programming paradigms.', 'C4', 3);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Develop small-scale applications utilizing OOP concepts in languages like Java or C++.', 'C3', 4);
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 1, 'Review of Procedural vs OOP');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 2, 'Classes and Objects');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 3, 'Data Abstraction & Encapsulation');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 4, 'Access Specifiers');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 5, 'Constructors - Types');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 6, 'Destructors');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 7, 'this Pointer');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 8, 'Static Members');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 9, 'Friend Functions');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 10, 'Operator Overloading - Unary');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 11, 'Operator Overloading - Binary');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 12, 'Inheritance - Single');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 13, 'Inheritance - Multiple');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 14, 'Inheritance - Multilevel');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 15, 'Function Overriding');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 16, 'Virtual Functions');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 17, 'Abstract Classes');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 18, 'Polymorphism - Compile Time');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 19, 'Polymorphism - Run Time');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 20, 'Interfaces');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 21, 'Templates - Function');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 22, 'Templates - Class');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 23, 'Exception Handling - Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 24, 'Exception Handling - try/catch/throw');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 25, 'File I/O with Classes');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 26, 'Collections & Generics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 27, 'Design Patterns - Introduction');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 28, 'UML Class Diagrams');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 29, 'Case Study - Library Management System');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 30, 'Case Study - Continued');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 31, 'Review & Best Practices');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 32, 'Final Project Presentation');
  END IF;
END $$;

-- CS-103
DO $$
DECLARE mc_id TEXT;
BEGIN
  SELECT id INTO mc_id FROM "MasterCourse" WHERE code = 'CS-103' LIMIT 1;
  IF mc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MasterCourseClo" WHERE "masterCourseId" = mc_id) THEN
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Draw and interpret digital logic diagrams, including combinational and sequential circuits.', 'C3', 0);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Design basic digital components such as multiplexers, flip-flops, and encoders.', 'C5', 1);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Analyze the behavior of digital systems using truth tables and Boolean algebra.', 'C4', 2);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Implement simple digital circuits using logic gates.', 'C3', 3);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Understand the fundamentals of digital system design and their applications.', 'C2', 4);
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 1, 'Number Systems');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 2, 'Number System Conversions');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 3, 'Binary Arithmetic');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 4, 'Boolean Algebra Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 5, 'Boolean Algebra Laws');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 6, 'Logic Gates - Basic');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 7, 'Logic Gates - Universal');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 8, 'Truth Tables');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 9, 'Karnaugh Maps - 2/3 Variable');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 10, 'Karnaugh Maps - 4 Variable');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 11, 'SOP & POS Forms');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 12, 'Combinational Circuits - Adders');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 13, 'Combinational Circuits - Subtractors');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 14, 'Multiplexers');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 15, 'Demultiplexers');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 16, 'Encoders');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 17, 'Decoders');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 18, 'Comparators');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 19, 'Introduction to Sequential Circuits');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 20, 'Flip-Flops - SR');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 21, 'Flip-Flops - JK');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 22, 'Flip-Flops - D & T');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 23, 'Registers');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 24, 'Shift Registers');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 25, 'Counters - Asynchronous');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 26, 'Counters - Synchronous');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 27, 'State Diagrams');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 28, 'State Tables');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 29, 'Finite State Machine Design');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 30, 'Memory Devices Overview');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 31, 'Review & Circuit Design Lab');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 32, 'Final Project Presentation');
  END IF;
END $$;

-- CS-104
DO $$
DECLARE mc_id TEXT;
BEGIN
  SELECT id INTO mc_id FROM "MasterCourse" WHERE code = 'CS-104' LIMIT 1;
  IF mc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MasterCourseClo" WHERE "masterCourseId" = mc_id) THEN
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Implement and analyze various data structures such as arrays, linked lists, stacks, queues, trees, and graphs.', 'C4', 0);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Select appropriate data structures to optimize algorithm performance.', 'C4', 1);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Demonstrate proficiency in traversing and manipulating data structures.', 'C3', 2);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Evaluate the efficiency of algorithms based on data structure choices.', 'C5', 3);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Solve complex problems using suitable data structures and algorithms.', 'C3', 4);
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 1, 'Introduction to Data Structures & ADTs');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 2, 'Arrays Review');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 3, 'Analysis of Algorithms - Big O');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 4, 'Analysis - Omega & Theta');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 5, 'Linked Lists - Singly');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 6, 'Linked Lists - Doubly');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 7, 'Linked Lists - Circular');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 8, 'Stacks - Implementation');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 9, 'Stack Applications');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 10, 'Queues - Implementation');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 11, 'Queue Applications - Circular Queue');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 12, 'Recursion & Data Structures');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 13, 'Trees - Introduction');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 14, 'Binary Trees');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 15, 'Binary Search Trees');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 16, 'BST Operations');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 17, 'Tree Traversals');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 18, 'AVL Trees');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 19, 'Heaps & Priority Queues');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 20, 'Heapsort');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 21, 'Hashing - Concepts');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 22, 'Hash Tables & Collision Resolution');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 23, 'Graphs - Representation');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 24, 'Graph Traversals - BFS');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 25, 'Graph Traversals - DFS');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 26, 'Shortest Path Algorithms');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 27, 'Minimum Spanning Trees');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 28, 'Sorting - Insertion & Selection');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 29, 'Sorting - Merge Sort');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 30, 'Sorting - Quick Sort');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 31, 'Sorting - Radix & Counting Sort');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 32, 'Review & Case Studies');
  END IF;
END $$;

-- CS-105
DO $$
DECLARE mc_id TEXT;
BEGIN
  SELECT id INTO mc_id FROM "MasterCourse" WHERE code = 'CS-105' LIMIT 1;
  IF mc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MasterCourseClo" WHERE "masterCourseId" = mc_id) THEN
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Design and normalize relational database schemas based on user requirements.', 'C5', 0);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Write SQL queries for data retrieval, insertion, update, and deletion.', 'C3', 1);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Explain the concepts of database transactions, concurrency, and recovery.', 'C2', 2);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Implement basic database management tasks using popular database management systems.', 'C3', 3);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Analyze the role of databases in information systems and their security considerations.', 'C4', 4);
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 1, 'Introduction to Databases');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 2, 'Database System Concepts & Architecture');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 3, 'Data Models & Schemas');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 4, 'Entity-Relationship Model');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 5, 'ER Diagrams - Advanced');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 6, 'Enhanced ER (EER) Model');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 7, 'Relational Model Concepts');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 8, 'Relational Constraints');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 9, 'ER-to-Relational Mapping');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 10, 'SQL - Data Definition');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 11, 'SQL - Basic Queries');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 12, 'SQL - Insert/Update/Delete');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 13, 'SQL - Complex Queries & Joins');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 14, 'SQL - Subqueries');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 15, 'SQL - Aggregate Functions');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 16, 'Relational Algebra');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 17, 'Functional Dependencies');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 18, 'Normalization - 1NF, 2NF');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 19, 'Normalization - 3NF, BCNF');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 20, 'Database Design Process');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 21, 'Transaction Concepts');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 22, 'Concurrency Control');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 23, 'Locking Protocols');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 24, 'Timestamp-Based Protocols');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 25, 'Database Recovery Techniques');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 26, 'Indexing & Hashing');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 27, 'Query Processing');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 28, 'Query Optimization');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 29, 'Database Security');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 30, 'NoSQL Databases Overview');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 31, 'Database Project - Design');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 32, 'Database Project - Implementation & Review');
  END IF;
END $$;

-- CS-106
DO $$
DECLARE mc_id TEXT;
BEGIN
  SELECT id INTO mc_id FROM "MasterCourse" WHERE code = 'CS-106' LIMIT 1;
  IF mc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MasterCourseClo" WHERE "masterCourseId" = mc_id) THEN
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Explain the functions and services provided by operating systems.', 'C2', 0);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Manage processes, threads, and synchronization mechanisms.', 'C3', 1);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Analyze memory management techniques and file systems.', 'C4', 2);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Implement basic scheduling algorithms.', 'C3', 3);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Evaluate operating system performance and security features.', 'C5', 4);
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 1, 'Introduction to Operating Systems');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 2, 'OS Structures & Services');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 3, 'System Calls');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 4, 'Process Concept');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 5, 'Process Scheduling');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 6, 'Operations on Processes');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 7, 'Inter-Process Communication');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 8, 'Threads - Concepts');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 9, 'Multithreading Models');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 10, 'CPU Scheduling - FCFS, SJF');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 11, 'CPU Scheduling - Priority, Round Robin');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 12, 'Multiprocessor Scheduling');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 13, 'Process Synchronization - Critical Section');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 14, 'Synchronization - Semaphores');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 15, 'Classical Synchronization Problems');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 16, 'Monitors');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 17, 'Deadlocks - Characterization');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 18, 'Deadlock Prevention & Avoidance');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 19, 'Deadlock Detection & Recovery');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 20, 'Memory Management - Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 21, 'Contiguous Memory Allocation');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 22, 'Paging');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 23, 'Segmentation');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 24, 'Virtual Memory - Demand Paging');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 25, 'Page Replacement Algorithms');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 26, 'Thrashing');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 27, 'File System - Concepts');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 28, 'File System Implementation');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 29, 'Mass Storage Structure');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 30, 'Disk Scheduling');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 31, 'Protection & Security');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 32, 'Review & Case Studies (Linux/Windows)');
  END IF;
END $$;

-- CS-107
DO $$
DECLARE mc_id TEXT;
BEGIN
  SELECT id INTO mc_id FROM "MasterCourse" WHERE code = 'CS-107' LIMIT 1;
  IF mc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MasterCourseClo" WHERE "masterCourseId" = mc_id) THEN
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Apply software development life cycle models to manage projects effectively.', 'C3', 0);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Develop software requirements specifications and design documents.', 'C3', 1);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Implement and test software applications using best practices.', 'C3', 2);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Analyze and manage software project risks and quality.', 'C4', 3);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Collaborate effectively in team-based software projects.', 'C3', 4);
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 1, 'Introduction to Software Engineering');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 2, 'Software Process Models - Waterfall');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 3, 'Software Process Models - Agile');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 4, 'Scrum Framework');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 5, 'Requirements Engineering - Elicitation');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 6, 'Requirements Specification (SRS)');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 7, 'Requirements Analysis');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 8, 'Use Case Modeling');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 9, 'UML - Class Diagrams');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 10, 'UML - Sequence Diagrams');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 11, 'UML - Activity Diagrams');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 12, 'Software Design Principles');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 13, 'Architectural Design');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 14, 'Design Patterns');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 15, 'User Interface Design');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 16, 'Component-Level Design');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 17, 'Coding Standards & Practices');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 18, 'Software Testing - Concepts');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 19, 'Unit Testing');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 20, 'Integration Testing');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 21, 'System & Acceptance Testing');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 22, 'Test Case Design Techniques');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 23, 'Software Quality Assurance');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 24, 'Software Metrics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 25, 'Project Planning & Estimation');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 26, 'Risk Management');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 27, 'Software Configuration Management');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 28, 'Software Maintenance');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 29, 'Team Project - Requirements Phase');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 30, 'Team Project - Design Phase');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 31, 'Team Project - Implementation & Testing');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 32, 'Team Project - Presentation & Review');
  END IF;
END $$;

-- CS-108
DO $$
DECLARE mc_id TEXT;
BEGIN
  SELECT id INTO mc_id FROM "MasterCourse" WHERE code = 'CS-108' LIMIT 1;
  IF mc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MasterCourseClo" WHERE "masterCourseId" = mc_id) THEN
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Describe the structure and function of computer components such as CPU, memory, and I/O devices.', 'C2', 0);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Write and understand basic assembly language programs.', 'C3', 1);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Analyze how hardware components interact during program execution.', 'C4', 2);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Explain the concepts of instruction set architecture and microarchitecture.', 'C2', 3);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Optimize programs considering hardware limitations.', 'C5', 4);
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 1, 'Introduction to Computer Organization');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 2, 'Computer Function & Interconnection');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 3, 'Number Representation');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 4, 'Data Representation - Floating Point');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 5, 'Register Transfer Language');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 6, 'Micro-operations');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 7, 'Instruction Set Architecture');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 8, 'Addressing Modes');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 9, 'CPU Organization');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 10, 'Instruction Cycle');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 11, 'Control Unit - Hardwired');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 12, 'Control Unit - Microprogrammed');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 13, 'Arithmetic Logic Unit Design');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 14, 'Booth''s Algorithm');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 15, 'Memory Hierarchy');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 16, 'Cache Memory - Concepts');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 17, 'Cache Mapping Techniques');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 18, 'Main Memory Organization');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 19, 'Virtual Memory Concepts');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 20, 'Input/Output Organization');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 21, 'I/O Interface Techniques');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 22, 'Interrupts');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 23, 'DMA (Direct Memory Access)');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 24, 'Pipelining - Concepts');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 25, 'Pipeline Hazards');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 26, 'Instruction-Level Parallelism');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 27, 'RISC vs CISC');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 28, 'Multiprocessors - Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 29, 'Assembly Language Programming - Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 30, 'Assembly Language Programming - Advanced');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 31, 'Review & Architecture Case Studies');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 32, 'Final Project Presentation');
  END IF;
END $$;

-- CS-109
DO $$
DECLARE mc_id TEXT;
BEGIN
  SELECT id INTO mc_id FROM "MasterCourse" WHERE code = 'CS-109' LIMIT 1;
  IF mc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MasterCourseClo" WHERE "masterCourseId" = mc_id) THEN
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Design efficient algorithms for common computational problems.', 'C5', 0);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Analyze algorithm complexity using Big O notation.', 'C4', 1);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Solve problems involving recursion, divide-and-conquer, and dynamic programming.', 'C3', 2);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Compare different algorithmic approaches to problem-solving.', 'C4', 3);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Demonstrate correctness and optimality of algorithms.', 'C3', 4);
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 1, 'Introduction to Algorithm Analysis');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 2, 'Asymptotic Notations - Big O');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 3, 'Asymptotic Notations - Omega, Theta');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 4, 'Recurrence Relations');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 5, 'Master Theorem');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 6, 'Divide and Conquer - Concepts');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 7, 'Merge Sort Analysis');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 8, 'Quick Sort Analysis');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 9, 'Binary Search & Variants');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 10, 'Greedy Algorithms - Concepts');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 11, 'Activity Selection Problem');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 12, 'Huffman Coding');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 13, 'Dynamic Programming - Concepts');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 14, 'Fibonacci & Memoization');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 15, '0/1 Knapsack Problem');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 16, 'Longest Common Subsequence');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 17, 'Matrix Chain Multiplication');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 18, 'Graph Algorithms - BFS/DFS Review');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 19, 'Minimum Spanning Trees - Kruskal');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 20, 'Minimum Spanning Trees - Prim');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 21, 'Shortest Path - Dijkstra');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 22, 'Shortest Path - Bellman-Ford');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 23, 'All-Pairs Shortest Path - Floyd-Warshall');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 24, 'Backtracking - Concepts');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 25, 'N-Queens Problem');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 26, 'Branch and Bound');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 27, 'String Matching Algorithms');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 28, 'NP-Completeness - Introduction');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 29, 'NP-Complete Problems');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 30, 'Approximation Algorithms');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 31, 'Review & Problem Solving');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 32, 'Final Project Presentation');
  END IF;
END $$;

-- CS-110
DO $$
DECLARE mc_id TEXT;
BEGIN
  SELECT id INTO mc_id FROM "MasterCourse" WHERE code = 'CS-110' LIMIT 1;
  IF mc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MasterCourseClo" WHERE "masterCourseId" = mc_id) THEN
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Explain the fundamental concepts of computer networking, including protocols, topologies, and models (OSI, TCP/IP).', 'C2', 0);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Configure and troubleshoot basic network devices and connections.', 'C3', 1);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Analyze network security threats and mitigation techniques.', 'C4', 2);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Demonstrate understanding of data transmission and error handling.', 'C3', 3);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Design simple network architectures to meet organizational needs.', 'C5', 4);
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 1, 'Introduction to Computer Networks');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 2, 'Network Topologies');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 3, 'OSI Reference Model');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 4, 'TCP/IP Model');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 5, 'Physical Layer - Transmission Media');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 6, 'Data Link Layer - Framing');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 7, 'Error Detection & Correction');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 8, 'Medium Access Control');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 9, 'Ethernet & LAN Technologies');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 10, 'Network Layer - Addressing');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 11, 'IP Addressing & Subnetting');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 12, 'Routing Algorithms - Distance Vector');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 13, 'Routing Algorithms - Link State');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 14, 'Network Layer Protocols - IP, ICMP');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 15, 'Transport Layer - UDP');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 16, 'Transport Layer - TCP');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 17, 'TCP Connection Management');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 18, 'Congestion Control');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 19, 'Application Layer - DNS');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 20, 'Application Layer - HTTP/HTTPS');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 21, 'Application Layer - FTP, SMTP');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 22, 'Wireless Networks - Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 23, 'Wireless LAN (WiFi)');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 24, 'Network Security - Threats');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 25, 'Network Security - Firewalls');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 26, 'Cryptography Basics for Networks');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 27, 'VPNs');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 28, 'Network Devices - Switches, Routers');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 29, 'Software Defined Networking - Intro');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 30, 'Network Troubleshooting');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 31, 'Review & Lab Practice');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 32, 'Final Project Presentation');
  END IF;
END $$;

-- CS-111
DO $$
DECLARE mc_id TEXT;
BEGIN
  SELECT id INTO mc_id FROM "MasterCourse" WHERE code = 'CS-111' LIMIT 1;
  IF mc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MasterCourseClo" WHERE "masterCourseId" = mc_id) THEN
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Explain fundamental concepts of information security, including confidentiality, integrity, and availability.', 'C2', 0);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Identify common security threats and vulnerabilities.', 'C2', 1);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Apply security measures such as encryption, authentication, and access control.', 'C3', 2);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Conduct basic security audits and risk assessments.', 'C3', 3);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Understand legal and ethical issues related to information security.', 'C2', 4);
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 1, 'Introduction to Information Security');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 2, 'CIA Triad - Confidentiality, Integrity, Availability');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 3, 'Security Threats & Attacks');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 4, 'Malware Types');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 5, 'Social Engineering Attacks');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 6, 'Cryptography - Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 7, 'Symmetric Key Cryptography');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 8, 'Asymmetric Key Cryptography');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 9, 'Hash Functions');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 10, 'Digital Signatures');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 11, 'Public Key Infrastructure');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 12, 'Authentication Mechanisms');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 13, 'Access Control Models');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 14, 'Network Security Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 15, 'Firewalls & Intrusion Detection');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 16, 'Web Application Security');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 17, 'SQL Injection & XSS');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 18, 'Security Protocols - SSL/TLS');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 19, 'Wireless Security');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 20, 'Operating System Security');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 21, 'Database Security');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 22, 'Risk Assessment');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 23, 'Security Policies');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 24, 'Security Audits');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 25, 'Incident Response');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 26, 'Disaster Recovery Planning');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 27, 'Legal & Ethical Issues in Security');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 28, 'Cyber Laws');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 29, 'Case Studies - Real World Breaches');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 30, 'Emerging Security Threats');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 31, 'Review & Security Lab');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 32, 'Final Project Presentation');
  END IF;
END $$;

-- CS-112
DO $$
DECLARE mc_id TEXT;
BEGIN
  SELECT id INTO mc_id FROM "MasterCourse" WHERE code = 'CS-112' LIMIT 1;
  IF mc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MasterCourseClo" WHERE "masterCourseId" = mc_id) THEN
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Describe core AI concepts including search algorithms, knowledge representation, and reasoning.', 'C2', 0);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Implement basic AI algorithms for problem-solving and decision-making.', 'C3', 1);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Analyze the applications of AI in real-world scenarios.', 'C4', 2);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Discuss ethical considerations and limitations of AI systems.', 'C2', 3);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Develop simple AI models using appropriate tools and frameworks.', 'C3', 4);
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 1, 'Introduction to AI');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 2, 'History & Applications of AI');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 3, 'Intelligent Agents');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 4, 'Problem Solving as Search');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 5, 'Uninformed Search - BFS, DFS');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 6, 'Informed Search - A*');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 7, 'Heuristic Functions');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 8, 'Local Search & Optimization');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 9, 'Adversarial Search - Minimax');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 10, 'Alpha-Beta Pruning');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 11, 'Constraint Satisfaction Problems');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 12, 'Knowledge Representation - Logic');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 13, 'Propositional Logic');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 14, 'First-Order Logic');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 15, 'Inference in Logic');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 16, 'Rule-Based Systems');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 17, 'Uncertainty & Probability Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 18, 'Bayesian Networks');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 19, 'Introduction to Machine Learning');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 20, 'Supervised Learning - Concepts');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 21, 'Decision Trees');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 22, 'Neural Networks - Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 23, 'Introduction to Natural Language Processing');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 24, 'NLP Applications');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 25, 'Computer Vision - Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 26, 'Expert Systems');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 27, 'Planning in AI');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 28, 'Robotics - Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 29, 'Ethics in AI');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 30, 'AI Tools & Frameworks Overview');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 31, 'Review & Case Studies');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 32, 'Final Project Presentation');
  END IF;
END $$;

-- CS-113
DO $$
DECLARE mc_id TEXT;
BEGIN
  SELECT id INTO mc_id FROM "MasterCourse" WHERE code = 'CS-113' LIMIT 1;
  IF mc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MasterCourseClo" WHERE "masterCourseId" = mc_id) THEN
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Explain the concepts of finite automata, regular expressions, and formal languages.', 'C2', 0);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Design automata to recognize specific languages.', 'C5', 1);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Demonstrate the equivalence of automata, regular expressions, and grammars.', 'C3', 2);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Analyze the limitations of finite automata and context-free grammars.', 'C4', 3);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Apply automata theory to compiler design and language processing.', 'C3', 4);
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 1, 'Introduction to Automata Theory');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 2, 'Alphabets, Strings & Languages');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 3, 'Finite Automata - Deterministic (DFA)');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 4, 'DFA Design Examples');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 5, 'Finite Automata - Non-Deterministic (NFA)');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 6, 'NFA to DFA Conversion');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 7, 'NFA with Epsilon Transitions');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 8, 'Regular Expressions');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 9, 'Regular Expressions to Automata');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 10, 'Equivalence of RE and FA');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 11, 'Regular Languages - Closure Properties');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 12, 'Pumping Lemma for Regular Languages');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 13, 'Minimization of DFA');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 14, 'Moore & Mealy Machines');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 15, 'Context-Free Grammars - Introduction');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 16, 'CFG Derivations & Parse Trees');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 17, 'Ambiguity in Grammars');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 18, 'Simplification of CFGs');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 19, 'Chomsky Normal Form');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 20, 'Greibach Normal Form');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 21, 'Pushdown Automata - Introduction');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 22, 'PDA Design');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 23, 'Equivalence of PDA and CFG');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 24, 'Pumping Lemma for CFLs');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 25, 'Context-Free Languages - Closure Properties');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 26, 'Turing Machines - Introduction');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 27, 'Turing Machine Design');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 28, 'Variations of Turing Machines');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 29, 'Decidability');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 30, 'Undecidability & Halting Problem');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 31, 'Chomsky Hierarchy Review');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 32, 'Review & Problem Solving');
  END IF;
END $$;

-- CS-114
DO $$
DECLARE mc_id TEXT;
BEGIN
  SELECT id INTO mc_id FROM "MasterCourse" WHERE code = 'CS-114' LIMIT 1;
  IF mc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MasterCourseClo" WHERE "masterCourseId" = mc_id) THEN
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Describe fundamental cloud computing models and services (IaaS, PaaS, SaaS).', 'C2', 0);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Deploy and manage applications in cloud environments.', 'C3', 1);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Analyze the benefits and challenges of cloud computing.', 'C4', 2);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Implement basic cloud security and compliance measures.', 'C3', 3);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Evaluate cloud solutions for scalability, cost, and performance.', 'C3', 4);
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 1, 'Introduction to Cloud Computing');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 2, 'Evolution of Cloud Computing');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 3, 'Cloud Computing Characteristics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 4, 'Cloud Service Models - IaaS');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 5, 'Cloud Service Models - PaaS');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 6, 'Cloud Service Models - SaaS');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 7, 'Cloud Deployment Models');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 8, 'Virtualization - Concepts');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 9, 'Hypervisors');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 10, 'Virtual Machines vs Containers');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 11, 'Introduction to Docker');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 12, 'Container Orchestration - Kubernetes Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 13, 'Cloud Storage Systems');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 14, 'Cloud Networking Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 15, 'Major Cloud Providers Overview (AWS, Azure, GCP)');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 16, 'AWS Core Services');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 17, 'Cloud Computing Architecture');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 18, 'Load Balancing in the Cloud');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 19, 'Auto-Scaling');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 20, 'Cloud Databases');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 21, 'Serverless Computing');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 22, 'Cloud Security Fundamentals');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 23, 'Identity & Access Management in Cloud');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 24, 'Cloud Compliance & Governance');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 25, 'Cost Management in Cloud');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 26, 'Cloud Migration Strategies');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 27, 'Disaster Recovery in Cloud');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 28, 'DevOps in Cloud Environments');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 29, 'Multi-Cloud & Hybrid Cloud');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 30, 'Emerging Trends - Edge Computing');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 31, 'Review & Cloud Lab');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 32, 'Final Project Presentation');
  END IF;
END $$;

-- Run in Supabase SQL Editor. Adds exam dates on Course, plus Holiday and
-- ClassDayMode tables for the Coordinator's calendar and the Instructor's
-- auto-fill lecture dates feature.

ALTER TABLE "Course"
  ADD COLUMN IF NOT EXISTS "midtermDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "finalDate" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "Holiday" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "coordinatorId" TEXT NOT NULL REFERENCES "User"("id"),
  "date" TIMESTAMP(3) NOT NULL,
  "label" TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "Holiday_coordinatorId_date_key" ON "Holiday"("coordinatorId", "date");
CREATE INDEX IF NOT EXISTS "Holiday_coordinatorId_idx" ON "Holiday"("coordinatorId");

CREATE TABLE IF NOT EXISTS "ClassDayMode" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "coordinatorId" TEXT NOT NULL REFERENCES "User"("id"),
  "date" TIMESTAMP(3) NOT NULL,
  "mode" TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ClassDayMode_coordinatorId_date_key" ON "ClassDayMode"("coordinatorId", "date");
CREATE INDEX IF NOT EXISTS "ClassDayMode_coordinatorId_idx" ON "ClassDayMode"("coordinatorId");
-- Run in Supabase SQL Editor. Adds the extra fields needed for the Course
-- Description Form report (textbook, references, catalog description, etc.)

ALTER TABLE "Course"
  ADD COLUMN IF NOT EXISTS "textbook" TEXT,
  ADD COLUMN IF NOT EXISTS "referenceMaterial" TEXT,
  ADD COLUMN IF NOT EXISTS "catalogDescription" TEXT,
  ADD COLUMN IF NOT EXISTS "programmingAssignmentsNote" TEXT,
  ADD COLUMN IF NOT EXISTS "labInstructorName" TEXT;
-- Run in Supabase SQL Editor. Adds MFA fields, session MFA-verified flag,
-- and the CqiRecord table.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "mfaSecret" TEXT,
  ADD COLUMN IF NOT EXISTS "mfaBackupCodes" TEXT;

ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "mfaVerified" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "CqiRecord" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "chairmanId" TEXT NOT NULL REFERENCES "User"("id"),
  "authorId" TEXT NOT NULL,
  "batchId" TEXT REFERENCES "Batch"("id"),
  "courseId" TEXT REFERENCES "Course"("id"),
  "finding" TEXT NOT NULL,
  "actionTaken" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CqiRecord_chairmanId_idx" ON "CqiRecord"("chairmanId");
CREATE INDEX IF NOT EXISTS "CqiRecord_batchId_idx" ON "CqiRecord"("batchId");
CREATE INDEX IF NOT EXISTS "CqiRecord_courseId_idx" ON "CqiRecord"("courseId");
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
-- Run in Supabase SQL Editor. Adds a "source" column to WeightExceptionRequest
-- so SE's and Instructor's weight-change requests are tracked separately
-- (previously only one exception request could exist per course at all).

ALTER TABLE "WeightExceptionRequest" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'SE';

DROP INDEX IF EXISTS "WeightExceptionRequest_courseId_key";
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'WeightExceptionRequest' AND con.contype = 'u'
      AND (SELECT array_agg(a.attname ORDER BY a.attnum)::text[] FROM pg_attribute a WHERE a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)) = ARRAY['courseId']::text[]
  LOOP EXECUTE format('ALTER TABLE "WeightExceptionRequest" DROP CONSTRAINT %I', r.conname); END LOOP;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "WeightExceptionRequest_courseId_source_key" ON "WeightExceptionRequest"("courseId", "source");
-- Run in Supabase SQL Editor. Covers: degree-wide semester dates, lecture
-- reschedule tracking, institute branding, and OMC change attribution.

CREATE TABLE IF NOT EXISTS "SemesterDates" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "coordinatorId" TEXT NOT NULL REFERENCES "User"("id"),
  "degreeProgram" TEXT NOT NULL,
  "termName" TEXT NOT NULL,
  "termYear" INTEGER NOT NULL,
  "semesterStartDate" TIMESTAMP(3),
  "midtermDate" TIMESTAMP(3),
  "finalDate" TIMESTAMP(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "SemesterDates_coordinatorId_degreeProgram_termName_termYear_key" ON "SemesterDates"("coordinatorId", "degreeProgram", "termName", "termYear");
CREATE INDEX IF NOT EXISTS "SemesterDates_coordinatorId_idx" ON "SemesterDates"("coordinatorId");

ALTER TABLE "LectureRow" ADD COLUMN IF NOT EXISTS "rescheduledNote" TEXT;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "instituteName" TEXT;

ALTER TABLE "WeightPolicy" ADD COLUMN IF NOT EXISTS "updatedById" TEXT;
ALTER TABLE "CourseEquivalenceGroup" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "CqiRecord" ADD COLUMN IF NOT EXISTS "lastUpdatedById" TEXT;
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "templateReviewedById" TEXT;
-- Run in Supabase SQL Editor. Backfills CLO and lecture-topic seed content
-- onto the 17 remaining genuinely-buildable HEC courses (General Education +
-- 2 IDS math courses), matched by code, skipping any course that already has it.

-- GE-101
DO $$
DECLARE mc_id TEXT;
BEGIN
  SELECT id INTO mc_id FROM "MasterCourse" WHERE code = 'GE-101' LIMIT 1;
  IF mc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MasterCourseClo" WHERE "masterCourseId" = mc_id) THEN
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Apply arithmetic and algebraic reasoning to solve real-world quantitative problems.', 'C3', 0);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Interpret and analyze data presented in tables, charts, and graphs.', 'C2', 1);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Apply basic concepts of probability and statistics to everyday situations.', 'C3', 2);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Use logical reasoning to evaluate quantitative arguments and claims.', 'C3', 3);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Solve problems involving ratios, proportions, and percentages in practical contexts.', 'C3', 4);
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 1, 'Introduction to Quantitative Reasoning');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 2, 'Numbers & Number Systems');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 3, 'Basic Arithmetic Operations');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 4, 'Ratios & Proportions');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 5, 'Percentages & Applications');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 6, 'Introduction to Algebra');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 7, 'Linear Equations');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 8, 'Solving Word Problems');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 9, 'Sets & Set Operations');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 10, 'Introduction to Functions');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 11, 'Graphs of Functions');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 12, 'Sequences & Series - Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 13, 'Introduction to Statistics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 14, 'Data Collection & Organization');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 15, 'Measures of Central Tendency');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 16, 'Measures of Dispersion');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 17, 'Data Visualization - Tables & Charts');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 18, 'Data Visualization - Graphs');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 19, 'Introduction to Probability');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 20, 'Basic Probability Rules');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 21, 'Permutations & Combinations - Intro');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 22, 'Logical Reasoning - Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 23, 'Evaluating Arguments');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 24, 'Estimation & Approximation');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 25, 'Unit Conversions');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 26, 'Financial Mathematics - Simple Interest');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 27, 'Financial Mathematics - Compound Interest');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 28, 'Problem Solving Strategies');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 29, 'Real-World Applications - Case Studies');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 30, 'Critical Thinking with Numbers');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 31, 'Review & Practice Problems');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 32, 'Final Project Presentation');
  END IF;
END $$;

-- GE-102
DO $$
DECLARE mc_id TEXT;
BEGIN
  SELECT id INTO mc_id FROM "MasterCourse" WHERE code = 'GE-102' LIMIT 1;
  IF mc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MasterCourseClo" WHERE "masterCourseId" = mc_id) THEN
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Develop proficiency in English language skills, including reading, writing, speaking, and listening.', 'C3', 0);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Understand and apply ethical considerations in academic and professional communication.', 'C2', 1);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Apply different writing styles, formats, and citation conventions.', 'C3', 2);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Enhance critical thinking and analytical skills to analyze and interpret texts.', 'C3', 3);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Communicate effectively in academic and professional contexts.', 'C3', 4);
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 1, 'Introduction to Functional English');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 2, 'Parts of Speech Review');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 3, 'Sentence Structure');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 4, 'Grammar - Tenses');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 5, 'Grammar - Common Errors');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 6, 'Vocabulary Building');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 7, 'Reading Comprehension - Skimming & Scanning');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 8, 'Reading Comprehension - Detailed Analysis');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 9, 'Listening Skills');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 10, 'Speaking Skills - Pronunciation');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 11, 'Speaking Skills - Presentations');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 12, 'Paragraph Writing');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 13, 'Essay Writing - Structure');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 14, 'Essay Writing - Types');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 15, 'Academic Writing Conventions');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 16, 'Citation & Referencing');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 17, 'Business Communication - Emails');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 18, 'Business Communication - Letters');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 19, 'Report Writing');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 20, 'Summarizing & Paraphrasing');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 21, 'Critical Reading');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 22, 'Analytical Writing');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 23, 'Group Discussion Skills');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 24, 'Interview Skills');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 25, 'Formal vs Informal Communication');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 26, 'Cross-Cultural Communication');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 27, 'Technical Writing Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 28, 'Proofreading & Editing');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 29, 'Public Speaking');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 30, 'Case Studies - Communication in Practice');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 31, 'Review & Practice');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 32, 'Final Presentation');
  END IF;
END $$;

-- GE-103
DO $$
DECLARE mc_id TEXT;
BEGIN
  SELECT id INTO mc_id FROM "MasterCourse" WHERE code = 'GE-103' LIMIT 1;
  IF mc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MasterCourseClo" WHERE "masterCourseId" = mc_id) THEN
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Demonstrate proficiency in using office productivity software for word processing, spreadsheets, and presentations.', 'C3', 0);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Explain fundamental concepts of computers, networks, and the internet.', 'C2', 1);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Apply digital tools for information search, communication, and collaboration.', 'C3', 2);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Understand basic concepts of digital security and ethics.', 'C2', 3);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Utilize ICT tools to solve everyday academic and professional tasks.', 'C3', 4);
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 1, 'Introduction to Computers & ICT');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 2, 'Computer Hardware Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 3, 'Operating Systems Overview');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 4, 'File Management');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 5, 'Introduction to Word Processing');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 6, 'Word Processing - Formatting');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 7, 'Word Processing - Advanced Features');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 8, 'Introduction to Spreadsheets');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 9, 'Spreadsheets - Formulas & Functions');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 10, 'Spreadsheets - Charts & Graphs');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 11, 'Introduction to Presentations');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 12, 'Presentations - Design Principles');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 13, 'Introduction to the Internet');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 14, 'Web Browsing & Search Techniques');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 15, 'Email & Communication Tools');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 16, 'Cloud Computing Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 17, 'Introduction to Databases');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 18, 'Social Media & Digital Communication');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 19, 'Digital Security - Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 20, 'Passwords & Authentication');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 21, 'Malware & Threats Awareness');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 22, 'Digital Ethics & Netiquette');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 23, 'Intellectual Property & Plagiarism');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 24, 'Introduction to Programming Concepts');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 25, 'Basic Web Design Concepts');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 26, 'Mobile Computing & Apps');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 27, 'E-Commerce Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 28, 'ICT in Education');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 29, 'ICT in Business');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 30, 'Emerging Technologies Overview');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 31, 'Review & Practice');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 32, 'Final Project Presentation');
  END IF;
END $$;

-- GE-104
DO $$
DECLARE mc_id TEXT;
BEGIN
  SELECT id INTO mc_id FROM "MasterCourse" WHERE code = 'GE-104' LIMIT 1;
  IF mc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MasterCourseClo" WHERE "masterCourseId" = mc_id) THEN
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Explain fundamental concepts and theories of social sciences.', 'C2', 0);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Analyze social structures, institutions, and their impact on society.', 'C4', 1);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Apply social science research methods to study societal issues.', 'C3', 2);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Discuss contemporary social issues from multiple perspectives.', 'C2', 3);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Evaluate the role of individuals and groups within society.', 'C5', 4);
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 1, 'Introduction to Social Sciences');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 2, 'Sociology - Basic Concepts');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 3, 'Social Institutions - Family');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 4, 'Social Institutions - Education');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 5, 'Social Institutions - Religion');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 6, 'Social Stratification');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 7, 'Culture & Society');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 8, 'Socialization Process');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 9, 'Introduction to Psychology');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 10, 'Human Behavior & Cognition');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 11, 'Introduction to Political Science');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 12, 'Government & Governance');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 13, 'Introduction to Economics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 14, 'Economic Systems');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 15, 'Introduction to Anthropology');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 16, 'Social Research Methods - Qualitative');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 17, 'Social Research Methods - Quantitative');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 18, 'Social Change & Development');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 19, 'Urbanization & Society');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 20, 'Population & Demography');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 21, 'Gender & Society');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 22, 'Social Movements');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 23, 'Globalization & Society');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 24, 'Media & Society');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 25, 'Social Problems - Poverty');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 26, 'Social Problems - Inequality');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 27, 'Social Welfare & Policy');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 28, 'Community & Civil Society');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 29, 'Ethics in Social Sciences');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 30, 'Case Studies - Social Issues in Pakistan');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 31, 'Review & Discussion');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 32, 'Final Presentation');
  END IF;
END $$;

-- IDS-101
DO $$
DECLARE mc_id TEXT;
BEGIN
  SELECT id INTO mc_id FROM "MasterCourse" WHERE code = 'IDS-101' LIMIT 1;
  IF mc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MasterCourseClo" WHERE "masterCourseId" = mc_id) THEN
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Apply differentiation techniques to solve problems involving rates of change.', 'C3', 0);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Apply integration techniques to compute areas and solve accumulation problems.', 'C3', 1);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Analyze functions using limits and continuity concepts.', 'C4', 2);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Solve problems involving analytical geometry, including lines, curves, and conic sections.', 'C3', 3);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Apply calculus concepts to model and solve real-world problems.', 'C3', 4);
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 1, 'Functions & Their Graphs');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 2, 'Limits - Basic Concepts');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 3, 'Limits - Techniques');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 4, 'Continuity');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 5, 'Introduction to Derivatives');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 6, 'Rules of Differentiation');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 7, 'Chain Rule');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 8, 'Implicit Differentiation');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 9, 'Applications of Derivatives - Rates of Change');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 10, 'Applications of Derivatives - Optimization');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 11, 'Higher-Order Derivatives');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 12, 'Curve Sketching');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 13, 'Introduction to Integration');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 14, 'Techniques of Integration - Substitution');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 15, 'Techniques of Integration - By Parts');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 16, 'Definite Integrals');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 17, 'Applications of Integration - Area');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 18, 'Applications of Integration - Volume');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 19, 'Analytical Geometry - Straight Lines');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 20, 'Analytical Geometry - Circles');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 21, 'Conic Sections - Parabola');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 22, 'Conic Sections - Ellipse');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 23, 'Conic Sections - Hyperbola');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 24, 'Polar Coordinates');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 25, 'Parametric Equations');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 26, 'Sequences & Series');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 27, 'Taylor & Maclaurin Series');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 28, 'Partial Derivatives - Intro');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 29, 'Multiple Integrals - Intro');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 30, 'Vector Calculus - Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 31, 'Review & Problem Solving');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 32, 'Final Exam Preparation');
  END IF;
END $$;

-- GE-105
DO $$
DECLARE mc_id TEXT;
BEGIN
  SELECT id INTO mc_id FROM "MasterCourse" WHERE code = 'GE-105' LIMIT 1;
  IF mc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MasterCourseClo" WHERE "masterCourseId" = mc_id) THEN
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Apply advanced statistical methods to analyze real-world data.', 'C3', 0);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Solve problems involving mathematical modeling.', 'C3', 1);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Apply quantitative reasoning to decision-making under uncertainty.', 'C3', 2);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Interpret and critique quantitative information in media and research.', 'C2', 3);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Use technology tools for quantitative analysis.', 'C3', 4);
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 1, 'Review of Quantitative Reasoning I');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 2, 'Mathematical Modeling - Introduction');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 3, 'Linear Models');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 4, 'Exponential & Logarithmic Models');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 5, 'Introduction to Matrices');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 6, 'Matrix Operations');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 7, 'Systems of Linear Equations');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 8, 'Optimization - Linear Programming Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 9, 'Advanced Probability');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 10, 'Probability Distributions');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 11, 'Normal Distribution');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 12, 'Sampling & Sampling Distributions');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 13, 'Hypothesis Testing - Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 14, 'Confidence Intervals');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 15, 'Correlation & Regression');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 16, 'Data Analysis with Technology');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 17, 'Financial Modeling');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 18, 'Decision Making Under Uncertainty');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 19, 'Game Theory - Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 20, 'Network Analysis - Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 21, 'Critiquing Statistics in Media');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 22, 'Misuse of Statistics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 23, 'Quantitative Reasoning in Research');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 24, 'Case Study - Health Statistics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 25, 'Case Study - Economic Data');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 26, 'Case Study - Social Data');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 27, 'Spreadsheet-Based Analysis');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 28, 'Introduction to Data Science Concepts');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 29, 'Ethics in Quantitative Analysis');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 30, 'Real-World Problem Solving');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 31, 'Review & Practice');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 32, 'Final Project Presentation');
  END IF;
END $$;

-- GE-106
DO $$
DECLARE mc_id TEXT;
BEGIN
  SELECT id INTO mc_id FROM "MasterCourse" WHERE code = 'GE-106' LIMIT 1;
  IF mc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MasterCourseClo" WHERE "masterCourseId" = mc_id) THEN
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Describe major movements and periods in art, literature, and philosophy.', 'C2', 0);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Analyze works of art, literature, and philosophy within their historical context.', 'C4', 1);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Demonstrate appreciation of diverse cultural and artistic expressions.', 'C3', 2);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Apply critical and creative thinking to interpret humanities texts and artifacts.', 'C3', 3);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Reflect on the role of arts and humanities in shaping human values and society.', 'C3', 4);
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 1, 'Introduction to Arts & Humanities');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 2, 'What is Art? - Defining Concepts');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 3, 'History of Visual Arts - Ancient');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 4, 'History of Visual Arts - Renaissance');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 5, 'History of Visual Arts - Modern');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 6, 'Introduction to Literature');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 7, 'Poetry - Forms & Analysis');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 8, 'Prose & the Novel');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 9, 'Drama & Theatre');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 10, 'World Literature Overview');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 11, 'Introduction to Philosophy');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 12, 'Ancient Philosophy');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 13, 'Islamic Philosophy & Thought');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 14, 'Modern Philosophy');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 15, 'Ethics & Moral Philosophy');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 16, 'Introduction to Music');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 17, 'Music History Overview');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 18, 'Introduction to Architecture');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 19, 'Architectural Styles');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 20, 'Film as an Art Form');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 21, 'Cultural Studies - Introduction');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 22, 'Pakistani Art & Culture');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 23, 'Calligraphy & Islamic Art');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 24, 'Aesthetics - Theory of Beauty');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 25, 'Comparative Religion & Humanities');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 26, 'Humanities in the Digital Age');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 27, 'Creative Writing - Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 28, 'Art Appreciation - Museum/Gallery Study');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 29, 'Interdisciplinary Humanities');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 30, 'Case Studies - Cultural Artifacts');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 31, 'Review & Discussion');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 32, 'Final Presentation');
  END IF;
END $$;

-- GE-107
DO $$
DECLARE mc_id TEXT;
BEGIN
  SELECT id INTO mc_id FROM "MasterCourse" WHERE code = 'GE-107' LIMIT 1;
  IF mc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MasterCourseClo" WHERE "masterCourseId" = mc_id) THEN
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Explain the ideological foundations and historical background of Pakistan''s creation.', 'C2', 0);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Analyze the political and constitutional development of Pakistan.', 'C4', 1);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Discuss the geography, society, and culture of Pakistan.', 'C2', 2);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Evaluate contemporary political and economic issues facing Pakistan.', 'C5', 3);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Develop a balanced understanding of Pakistan''s foreign policy and international relations.', 'C3', 4);
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 1, 'Introduction to Pakistan Studies');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 2, 'Ideology of Pakistan');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 3, 'Two-Nation Theory');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 4, 'Freedom Movement - Early Phase');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 5, 'Freedom Movement - Role of Quaid-e-Azam');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 6, 'Pakistan Resolution 1940');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 7, 'Independence & Partition 1947');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 8, 'Constitutional History - 1956 Constitution');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 9, 'Constitutional History - 1962 Constitution');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 10, 'Constitutional History - 1973 Constitution');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 11, 'Political Development - Early Years');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 12, 'Political Development - Democratic Eras');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 13, 'Political Development - Military Eras');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 14, 'Geography of Pakistan');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 15, 'Natural Resources of Pakistan');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 16, 'Society & Social Structure');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 17, 'Culture & Heritage of Pakistan');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 18, 'Economy of Pakistan - Overview');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 19, 'Economic Challenges & Issues');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 20, 'Agricultural Economy');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 21, 'Industrial Development');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 22, 'Education System of Pakistan');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 23, 'Foreign Policy - Overview');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 24, 'Pakistan-India Relations');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 25, 'Pakistan & the Muslim World');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 26, 'Pakistan & Global Powers');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 27, 'Contemporary Political Issues');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 28, 'Provincial Autonomy & Federalism');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 29, 'Role of Media in Pakistan');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 30, 'Challenges of Governance');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 31, 'Review & Discussion');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 32, 'Final Presentation');
  END IF;
END $$;

-- GE-108
DO $$
DECLARE mc_id TEXT;
BEGIN
  SELECT id INTO mc_id FROM "MasterCourse" WHERE code = 'GE-108' LIMIT 1;
  IF mc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MasterCourseClo" WHERE "masterCourseId" = mc_id) THEN
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Recite selected verses of the Holy Quran with correct pronunciation (Tajweed).', 'C3', 0);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Translate and explain the meaning of selected Quranic verses.', 'C3', 1);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Identify key themes and teachings in the assigned portion of the Quran.', 'C2', 2);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Reflect on the practical application of Quranic teachings in daily life.', 'C3', 3);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Demonstrate understanding of the historical context of revelation for selected verses.', 'C3', 4);
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 1, 'Introduction to Quranic Studies');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 2, 'Basics of Tajweed');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 3, 'Makharij (Articulation Points)');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 4, 'Selected Surah - Al-Fatiha');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 5, 'Al-Fatiha - Translation & Tafseer');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 6, 'Selected Surah - Al-Baqarah (Opening Verses)');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 7, 'Al-Baqarah - Translation');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 8, 'Al-Baqarah - Key Themes');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 9, 'Selected Verses on Tawheed');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 10, 'Selected Verses on Prophethood');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 11, 'Selected Verses on Akhirah');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 12, 'Selected Verses on Worship (Ibadah)');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 13, 'Selected Verses on Salah');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 14, 'Selected Verses on Zakat & Charity');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 15, 'Selected Verses on Fasting');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 16, 'Selected Verses on Family & Ethics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 17, 'Selected Verses on Justice');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 18, 'Selected Verses on Patience & Gratitude');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 19, 'Asbab al-Nuzul - Introduction');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 20, 'Historical Context of Selected Verses');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 21, 'Stories of the Prophets in the Quran - I');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 22, 'Stories of the Prophets in the Quran - II');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 23, 'Selected Verses on Knowledge');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 24, 'Selected Verses on Community');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 25, 'Memorization Practice - Short Surahs');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 26, 'Tajweed Practice Session');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 27, 'Translation Practice');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 28, 'Thematic Study - Morality in the Quran');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 29, 'Thematic Study - Social Justice in the Quran');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 30, 'Application in Daily Life');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 31, 'Review & Recitation Assessment');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 32, 'Final Assessment');
  END IF;
END $$;

-- IDS-102
DO $$
DECLARE mc_id TEXT;
BEGIN
  SELECT id INTO mc_id FROM "MasterCourse" WHERE code = 'IDS-102' LIMIT 1;
  IF mc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MasterCourseClo" WHERE "masterCourseId" = mc_id) THEN
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Perform operations on matrices and solve systems of linear equations.', 'C3', 0);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Apply concepts of vector spaces and linear transformations.', 'C3', 1);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Compute eigenvalues and eigenvectors and apply them to problem-solving.', 'C3', 2);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Apply determinants and their properties in solving linear algebra problems.', 'C3', 3);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Solve real-world problems using linear algebra techniques.', 'C3', 4);
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 1, 'Introduction to Matrices');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 2, 'Matrix Operations');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 3, 'Types of Matrices');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 4, 'Systems of Linear Equations - Introduction');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 5, 'Gaussian Elimination');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 6, 'Gauss-Jordan Elimination');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 7, 'Matrix Inverse');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 8, 'Determinants - Introduction');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 9, 'Properties of Determinants');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 10, 'Cramer''s Rule');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 11, 'Vector Spaces - Introduction');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 12, 'Subspaces');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 13, 'Linear Independence');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 14, 'Basis & Dimension');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 15, 'Linear Transformations - Introduction');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 16, 'Matrix Representation of Linear Transformations');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 17, 'Kernel & Range');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 18, 'Eigenvalues - Introduction');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 19, 'Eigenvectors');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 20, 'Diagonalization');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 21, 'Inner Product Spaces');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 22, 'Orthogonality');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 23, 'Gram-Schmidt Process');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 24, 'Applications - Computer Graphics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 25, 'Applications - Systems Analysis');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 26, 'Applications - Data Science / PCA Intro');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 27, 'Symmetric Matrices');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 28, 'Quadratic Forms');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 29, 'Singular Value Decomposition - Intro');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 30, 'Applications in Engineering');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 31, 'Review & Problem Solving');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 32, 'Final Exam Preparation');
  END IF;
END $$;

-- GE-109
DO $$
DECLARE mc_id TEXT;
BEGIN
  SELECT id INTO mc_id FROM "MasterCourse" WHERE code = 'GE-109' LIMIT 1;
  IF mc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MasterCourseClo" WHERE "masterCourseId" = mc_id) THEN
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Compose well-structured expository essays on academic topics.', 'C3', 0);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Apply research skills to gather and synthesize information from credible sources.', 'C3', 1);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Demonstrate proper use of citation and referencing styles.', 'C3', 2);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Apply advanced grammar and style conventions in academic writing.', 'C3', 3);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Evaluate and revise written work for clarity and coherence.', 'C5', 4);
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 1, 'Introduction to Expository Writing');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 2, 'The Writing Process - Prewriting');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 3, 'The Writing Process - Drafting');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 4, 'The Writing Process - Revising');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 5, 'Thesis Statement Development');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 6, 'Organizing Ideas - Outlining');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 7, 'Paragraph Development');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 8, 'Types of Expository Essays - Definition');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 9, 'Types of Expository Essays - Compare & Contrast');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 10, 'Types of Expository Essays - Cause & Effect');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 11, 'Types of Expository Essays - Process Analysis');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 12, 'Argumentative Writing Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 13, 'Research Skills - Finding Sources');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 14, 'Evaluating Source Credibility');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 15, 'Note-Taking & Synthesis');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 16, 'Avoiding Plagiarism');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 17, 'Citation Styles - APA');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 18, 'Citation Styles - MLA');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 19, 'Integrating Quotes & Paraphrases');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 20, 'Writing Introductions');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 21, 'Writing Conclusions');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 22, 'Cohesion & Coherence');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 23, 'Sentence Variety & Style');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 24, 'Academic Vocabulary');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 25, 'Peer Review Techniques');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 26, 'Revising for Clarity');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 27, 'Editing & Proofreading');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 28, 'Writing for Different Audiences');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 29, 'Digital & Online Writing');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 30, 'Portfolio Development');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 31, 'Review & Practice');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 32, 'Final Essay Submission');
  END IF;
END $$;

-- GE-110
DO $$
DECLARE mc_id TEXT;
BEGIN
  SELECT id INTO mc_id FROM "MasterCourse" WHERE code = 'GE-110' LIMIT 1;
  IF mc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MasterCourseClo" WHERE "masterCourseId" = mc_id) THEN
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Explain fundamental concepts in physics, chemistry, and biology.', 'C2', 0);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Apply the scientific method to analyze natural phenomena.', 'C3', 1);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Discuss the relationship between science, technology, and society.', 'C2', 2);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Analyze environmental issues from a scientific perspective.', 'C4', 3);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Conduct basic scientific experiments and interpret results.', 'C3', 4);
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 1, 'Introduction to Natural Sciences & Scientific Method');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 2, 'Matter & Its Properties');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 3, 'Basic Chemistry - Atoms & Elements');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 4, 'Basic Chemistry - Chemical Reactions');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 5, 'Basic Physics - Motion & Forces');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 6, 'Basic Physics - Energy');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 7, 'Basic Physics - Waves & Light');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 8, 'Introduction to Biology - Cell Structure');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 9, 'Biology - Genetics Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 10, 'Biology - Evolution');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 11, 'Human Body Systems Overview');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 12, 'Ecology & Ecosystems');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 13, 'Biodiversity');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 14, 'Earth Science - Geology Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 15, 'Earth Science - Atmosphere & Weather');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 16, 'Astronomy Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 17, 'Environmental Science - Pollution');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 18, 'Environmental Science - Climate Change');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 19, 'Renewable Energy Sources');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 20, 'Natural Resource Conservation');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 21, 'Science & Technology Interaction');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 22, 'Science in Everyday Life');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 23, 'Laboratory Safety & Practices');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 24, 'Experiment - Physical Sciences');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 25, 'Experiment - Chemical Sciences');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 26, 'Experiment - Biological Sciences');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 27, 'Data Analysis in Science');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 28, 'Scientific Ethics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 29, 'Emerging Scientific Fields');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 30, 'Science Communication');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 31, 'Review & Discussion');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 32, 'Final Presentation');
  END IF;
END $$;

-- GE-111
DO $$
DECLARE mc_id TEXT;
BEGIN
  SELECT id INTO mc_id FROM "MasterCourse" WHERE code = 'GE-111' LIMIT 1;
  IF mc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MasterCourseClo" WHERE "masterCourseId" = mc_id) THEN
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Recite an extended portion of the Holy Quran with correct Tajweed rules.', 'C3', 0);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Translate and explain the meaning of an extended set of Quranic verses.', 'C3', 1);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Analyze thematic content across multiple Surahs studied.', 'C4', 2);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Apply Quranic guidance to contemporary personal and social issues.', 'C3', 3);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Demonstrate understanding of Quranic exegesis (Tafseer) methodology.', 'C3', 4);
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 1, 'Review of Fehm-e-Quran I');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 2, 'Advanced Tajweed Rules');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 3, 'Selected Surah - Yasin (Part 1)');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 4, 'Selected Surah - Yasin (Part 2)');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 5, 'Selected Surah - Ar-Rahman (Part 1)');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 6, 'Selected Surah - Ar-Rahman (Part 2)');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 7, 'Selected Surah - Al-Mulk');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 8, 'Introduction to Tafseer Methodology');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 9, 'Classical Tafseer Overview');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 10, 'Selected Verses on Governance');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 11, 'Selected Verses on Economic Justice');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 12, 'Selected Verses on Human Rights');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 13, 'Selected Verses on Environment');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 14, 'Selected Verses on Knowledge & Science');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 15, 'Selected Verses on Interfaith Relations');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 16, 'Stories of the Prophets - Advanced Study I');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 17, 'Stories of the Prophets - Advanced Study II');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 18, 'Thematic Study - Leadership in the Quran');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 19, 'Thematic Study - Family Values');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 20, 'Thematic Study - Contemporary Social Issues');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 21, 'Memorization Practice - Extended Verses');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 22, 'Tajweed Assessment Practice');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 23, 'Translation Practice - Advanced');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 24, 'Comparative Study of Selected Tafaseer');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 25, 'Quranic Guidance for Youth');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 26, 'Quranic Guidance on Ethics in Business');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 27, 'Application in Modern Life - Case Studies');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 28, 'Group Discussion & Reflection');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 29, 'Quran & Contemporary Challenges');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 30, 'Review of Thematic Studies');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 31, 'Recitation & Comprehension Assessment');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 32, 'Final Assessment');
  END IF;
END $$;

-- GE-112
DO $$
DECLARE mc_id TEXT;
BEGIN
  SELECT id INTO mc_id FROM "MasterCourse" WHERE code = 'GE-112' LIMIT 1;
  IF mc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MasterCourseClo" WHERE "masterCourseId" = mc_id) THEN
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Explain the concepts of citizenship, rights, and civic responsibilities.', 'C2', 0);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Analyze the structure and function of local, provincial, and national governance.', 'C4', 1);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Design and participate in community engagement or service-learning projects.', 'C5', 2);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Evaluate the role of civil society organizations in community development.', 'C5', 3);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Demonstrate effective communication and teamwork skills in community settings.', 'C3', 4);
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 1, 'Introduction to Civics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 2, 'Citizenship - Rights & Responsibilities');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 3, 'Fundamental Rights in the Constitution');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 4, 'Local Government Structure');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 5, 'Provincial Government Structure');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 6, 'National Government Structure');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 7, 'Electoral Process in Pakistan');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 8, 'Role of Civil Society');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 9, 'NGOs & Community Organizations');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 10, 'Community Needs Assessment');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 11, 'Service-Learning - Concepts');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 12, 'Project Planning for Community Engagement');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 13, 'Volunteering & Social Responsibility');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 14, 'Community Mobilization Techniques');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 15, 'Communication Skills for Community Work');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 16, 'Teamwork & Leadership');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 17, 'Conflict Resolution in Communities');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 18, 'Gender & Community Engagement');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 19, 'Youth in Civic Life');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 20, 'Environmental Civic Responsibility');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 21, 'Digital Citizenship');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 22, 'Advocacy & Awareness Campaigns');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 23, 'Fundraising for Community Projects');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 24, 'Monitoring & Evaluation of Projects');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 25, 'Case Study - Successful Community Projects');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 26, 'Field Visit / Community Interaction');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 27, 'Project Implementation');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 28, 'Reflective Practice');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 29, 'Reporting on Community Engagement');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 30, 'Ethics in Community Work');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 31, 'Review & Presentation Prep');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 32, 'Final Project Presentation');
  END IF;
END $$;

-- GE-113
DO $$
DECLARE mc_id TEXT;
BEGIN
  SELECT id INTO mc_id FROM "MasterCourse" WHERE code = 'GE-113' LIMIT 1;
  IF mc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MasterCourseClo" WHERE "masterCourseId" = mc_id) THEN
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Explain the ideological basis for the creation of Pakistan.', 'C2', 0);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Analyze the key features and evolution of Pakistan''s constitutions.', 'C4', 1);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Discuss fundamental rights and principles of policy in the Constitution of Pakistan.', 'C2', 2);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Evaluate the structure of government under the 1973 Constitution.', 'C5', 3);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Assess contemporary constitutional and governance challenges in Pakistan.', 'C3', 4);
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 1, 'Introduction to Ideology of Pakistan');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 2, 'Islamic Ideology & Nationhood');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 3, 'Two-Nation Theory Revisited');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 4, 'Allama Iqbal''s Vision');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 5, 'Quaid-e-Azam''s Vision');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 6, 'Constitutional Development - Pre-1956');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 7, 'Objectives Resolution 1949');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 8, 'Constitution of 1956');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 9, 'Constitution of 1962');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 10, 'Constitution of 1973 - Background');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 11, 'Salient Features of 1973 Constitution');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 12, 'Fundamental Rights');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 13, 'Principles of Policy');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 14, 'Federal Structure & Distribution of Powers');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 15, 'Parliament - National Assembly');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 16, 'Parliament - Senate');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 17, 'Executive - President & Prime Minister');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 18, 'Judiciary - Structure & Independence');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 19, '18th Amendment & Provincial Autonomy');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 20, 'Islamic Provisions in the Constitution');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 21, 'Council of Islamic Ideology');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 22, 'Amendments to the Constitution - Overview');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 23, 'Emergency Provisions');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 24, 'Local Government under the Constitution');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 25, 'Constitutional Crises in Pakistani History');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 26, 'Judicial Activism & Constitutionalism');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 27, 'Contemporary Constitutional Debates');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 28, 'Comparative Constitutional Perspectives');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 29, 'Rule of Law & Governance');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 30, 'Case Studies - Landmark Constitutional Cases');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 31, 'Review & Discussion');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 32, 'Final Presentation');
  END IF;
END $$;

-- GE-114
DO $$
DECLARE mc_id TEXT;
BEGIN
  SELECT id INTO mc_id FROM "MasterCourse" WHERE code = 'GE-114' LIMIT 1;
  IF mc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MasterCourseClo" WHERE "masterCourseId" = mc_id) THEN
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Explain fundamental concepts of entrepreneurship and the entrepreneurial mindset.', 'C2', 0);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Develop a business idea and evaluate its feasibility.', 'C3', 1);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Prepare a basic business plan including marketing and financial components.', 'C5', 2);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Analyze the role of innovation and risk-taking in entrepreneurial ventures.', 'C4', 3);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Discuss the startup ecosystem and funding options available to entrepreneurs.', 'C2', 4);
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 1, 'Introduction to Entrepreneurship');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 2, 'The Entrepreneurial Mindset');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 3, 'Types of Entrepreneurship');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 4, 'Idea Generation Techniques');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 5, 'Opportunity Recognition');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 6, 'Market Research Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 7, 'Customer Discovery');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 8, 'Business Model Canvas');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 9, 'Value Proposition Design');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 10, 'Competitive Analysis');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 11, 'Marketing Strategy Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 12, 'Branding & Positioning');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 13, 'Financial Basics for Entrepreneurs');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 14, 'Startup Costing & Budgeting');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 15, 'Revenue Models');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 16, 'Introduction to Business Plans');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 17, 'Writing a Business Plan - Executive Summary');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 18, 'Writing a Business Plan - Operations');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 19, 'Writing a Business Plan - Financial Projections');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 20, 'Legal Structures for Startups');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 21, 'Intellectual Property for Startups');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 22, 'Funding Options - Bootstrapping');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 23, 'Funding Options - Angel Investors & VC');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 24, 'Pitching Your Business Idea');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 25, 'Risk Management in Startups');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 26, 'Innovation & Creativity in Business');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 27, 'Social Entrepreneurship');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 28, 'Digital Entrepreneurship & E-Commerce');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 29, 'Scaling a Business');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 30, 'Case Studies - Successful Startups in Pakistan');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 31, 'Review & Pitch Practice');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 32, 'Final Pitch Presentation');
  END IF;
END $$;

-- GE-115
DO $$
DECLARE mc_id TEXT;
BEGIN
  SELECT id INTO mc_id FROM "MasterCourse" WHERE code = 'GE-115' LIMIT 1;
  IF mc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MasterCourseClo" WHERE "masterCourseId" = mc_id) THEN
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Identify key principles and sources of Islamic jurisprudence (Fiqh).', 'C2', 0);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Explain major historical developments in Islamic civilization.', 'C2', 1);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Analyze the Islamic economic and political systems.', 'C4', 2);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Discuss ethical values and the family system in Islam.', 'C2', 3);
    INSERT INTO "MasterCourseClo" (id, "masterCourseId", statement, "bloomLevel", "orderIndex") VALUES (gen_random_uuid()::text, mc_id, 'Connect historical developments with contemporary Islamic issues and movements.', 'C4', 4);
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 1, 'Introduction to Islamic Studies');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 2, 'Sources of Islamic Law - Quran');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 3, 'Sources of Islamic Law - Sunnah');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 4, 'Sources of Islamic Law - Ijma & Qiyas');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 5, 'Introduction to Fiqh');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 6, 'Schools of Islamic Jurisprudence');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 7, 'Islamic Worship - Salah');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 8, 'Islamic Worship - Zakat');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 9, 'Islamic Worship - Sawm (Fasting)');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 10, 'Islamic Worship - Hajj');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 11, 'Islamic Civilization - Early Period');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 12, 'Khilafat-e-Rashida');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 13, 'Umayyad Period');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 14, 'Abbasid Period');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 15, 'Islamic Contributions to Science');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 16, 'Islamic Contributions to Philosophy');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 17, 'Islamic Economic System - Principles');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 18, 'Islamic Banking & Finance Basics');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 19, 'Islamic Political System - Concepts');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 20, 'Concept of Khilafat & Governance');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 21, 'Family System in Islam');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 22, 'Marriage & Family Rights');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 23, 'Ethical Values in Islam');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 24, 'Islamic Social Justice');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 25, 'Human Rights in Islam');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 26, 'Islam & Contemporary Issues');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 27, 'Interfaith Relations in Islam');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 28, 'Islamic Movements - Overview');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 29, 'Muslim World Today');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 30, 'Case Studies - Contemporary Islamic Issues');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 31, 'Review & Discussion');
    INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic) VALUES (gen_random_uuid()::text, mc_id, 32, 'Final Presentation');
  END IF;
END $$;

-- Run in Supabase SQL Editor. Adds the PlatformSettings singleton table for
-- Super-User-only branding (institute name/logo, NCEAC logo, Lets Innovate
-- logo) shown across every page and report.

CREATE TABLE IF NOT EXISTS "PlatformSettings" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
  "instituteName" TEXT,
  "instituteLogo" TEXT,
  "ownerLogo" TEXT,
  "nceacLogo" TEXT
);
-- Run in Supabase SQL Editor. Adds the per-Chairman institute logo field
-- (each paying tenant institution has its own name/logo, set only by the
-- Super User). Note: PlatformSettings.instituteName/instituteLogo columns
-- from an earlier migration are now unused (superseded by this per-Chairman
-- approach) — harmless to leave, no code references them.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "instituteLogo" TEXT;
-- Run in Supabase SQL Editor. Converts midterm/final from single dates to
-- date ranges (they span a full exam week), on both SemesterDates (the
-- degree-wide default) and Course (the per-course override).

ALTER TABLE "SemesterDates"
  ADD COLUMN IF NOT EXISTS "midtermStartDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "midtermEndDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "finalStartDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "finalEndDate" TIMESTAMP(3);

-- Best-effort carry-over of any previously-set single dates into the new
-- start-date columns — only if the old columns still exist (safe to re-run
-- even after they've already been migrated and dropped once).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'SemesterDates' AND column_name = 'midtermDate') THEN
    UPDATE "SemesterDates" SET "midtermStartDate" = "midtermDate" WHERE "midtermDate" IS NOT NULL AND "midtermStartDate" IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'SemesterDates' AND column_name = 'finalDate') THEN
    UPDATE "SemesterDates" SET "finalStartDate" = "finalDate" WHERE "finalDate" IS NOT NULL AND "finalStartDate" IS NULL;
  END IF;
END $$;
ALTER TABLE "SemesterDates" DROP COLUMN IF EXISTS "midtermDate";
ALTER TABLE "SemesterDates" DROP COLUMN IF EXISTS "finalDate";

ALTER TABLE "Course"
  ADD COLUMN IF NOT EXISTS "midtermStartDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "midtermEndDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "finalStartDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "finalEndDate" TIMESTAMP(3);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Course' AND column_name = 'midtermDate') THEN
    UPDATE "Course" SET "midtermStartDate" = "midtermDate" WHERE "midtermDate" IS NOT NULL AND "midtermStartDate" IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Course' AND column_name = 'finalDate') THEN
    UPDATE "Course" SET "finalStartDate" = "finalDate" WHERE "finalDate" IS NOT NULL AND "finalStartDate" IS NULL;
  END IF;
END $$;
ALTER TABLE "Course" DROP COLUMN IF EXISTS "midtermDate";
ALTER TABLE "Course" DROP COLUMN IF EXISTS "finalDate";
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
-- Run in Supabase SQL Editor. Adds faculty specialization tagging and the
-- assignment history snapshot table (needed since Course only tracks its
-- CURRENT offering term — this preserves prior terms' data before it gets
-- overwritten).

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "specialization" TEXT;

CREATE TABLE IF NOT EXISTS "AssignmentSnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "coordinatorId" TEXT NOT NULL,
  "courseLabel" TEXT NOT NULL,
  "courseType" TEXT NOT NULL,
  "batchLabel" TEXT NOT NULL,
  "termName" TEXT NOT NULL,
  "termYear" INTEGER NOT NULL,
  "instructorName" TEXT NOT NULL,
  "sectionCount" INTEGER NOT NULL,
  "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AssignmentSnapshot_coordinatorId_idx" ON "AssignmentSnapshot"("coordinatorId");
CREATE INDEX IF NOT EXISTS "AssignmentSnapshot_termName_termYear_idx" ON "AssignmentSnapshot"("termName", "termYear");
-- Run in Supabase SQL Editor. Adds: the report ACL system, report bundles
-- (platform + coordinator scope), and program-level narrative content used
-- by the full program document generator.

CREATE TABLE IF NOT EXISTS "ReportAccessRule" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "chairmanId" TEXT NOT NULL REFERENCES "User"("id"),
  "reportId" TEXT NOT NULL,
  "subjectType" TEXT NOT NULL,
  "subjectValue" TEXT NOT NULL,
  "canView" BOOLEAN NOT NULL DEFAULT true,
  "canEdit" BOOLEAN NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS "ReportAccessRule_chairmanId_reportId_subjectType_subjectValue_key" ON "ReportAccessRule"("chairmanId", "reportId", "subjectType", "subjectValue");
CREATE INDEX IF NOT EXISTS "ReportAccessRule_chairmanId_idx" ON "ReportAccessRule"("chairmanId");

CREATE TABLE IF NOT EXISTS "ReportBundle" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "scope" TEXT NOT NULL,
  "ownerId" TEXT,
  "reportIds" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "ReportBundle_ownerId_idx" ON "ReportBundle"("ownerId");

CREATE TABLE IF NOT EXISTS "ProgramProfile" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "coordinatorId" TEXT NOT NULL REFERENCES "User"("id"),
  "degreeProgram" TEXT NOT NULL,
  "departmentIntro" TEXT,
  "departmentVision" TEXT,
  "departmentMission" TEXT,
  "peos" TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProgramProfile_coordinatorId_degreeProgram_key" ON "ProgramProfile"("coordinatorId", "degreeProgram");
-- Run in Supabase SQL Editor. Adds dual-role capability: a Subject Expert
-- can also be assigned/act as an Instructor on the same account.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "secondaryRole" TEXT;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "activeRole" TEXT;
-- Run in Supabase SQL Editor. Adds hasLab to Course — when false, Lab %
-- is locked to 0 in weight-setting (Weight Policy compliance checks skip
-- the lab category for these courses too).

ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "hasLab" BOOLEAN NOT NULL DEFAULT true;
-- Run in Supabase SQL Editor. Adds the attainment snapshot table, used for
-- comparing a course's CLO/PLO pass rates against a past offering. Taken
-- automatically right before a course is re-offered — which also clears
-- that course's StudentMark and StudentEnrollment records so old and new
-- students' marks never mix together in the same view.

CREATE TABLE IF NOT EXISTS "AttainmentSnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "coordinatorId" TEXT NOT NULL,
  "courseLabel" TEXT NOT NULL,
  "termName" TEXT NOT NULL,
  "termYear" INTEGER NOT NULL,
  "studentCount" INTEGER NOT NULL,
  "cloStatsJson" TEXT NOT NULL,
  "ploStatsJson" TEXT NOT NULL,
  "histogramJson" TEXT NOT NULL,
  "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AttainmentSnapshot_coordinatorId_idx" ON "AttainmentSnapshot"("coordinatorId");
-- Run in Supabase SQL Editor. MasterCurriculum/MasterCourse/MasterPLO were
-- created outside the tracked migration files early in this project (a
-- direct schema push), so later column additions to MasterCurriculum were
-- never actually migrated. This adds anything that might be missing,
-- safely, on tables that already exist.

ALTER TABLE "MasterCurriculum" ADD COLUMN IF NOT EXISTS "sourceReference" TEXT;
ALTER TABLE "MasterCurriculum" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE "MasterCurriculum" ADD COLUMN IF NOT EXISTS "publicationDate" TIMESTAMP(3);
-- Run in Supabase SQL Editor. Adds StudentTranscriptRecord — a permanent
-- per-student, per-course-offering snapshot of grade and CLO/PLO
-- attainment, taken right before that course's marks get wiped on
-- re-offering, so individual transcripts survive across every semester.

CREATE TABLE IF NOT EXISTS "StudentTranscriptRecord" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "studentId" TEXT NOT NULL REFERENCES "Student"("id"),
  "coordinatorId" TEXT NOT NULL,
  "courseCode" TEXT NOT NULL,
  "courseTitle" TEXT NOT NULL,
  "creditHours" INTEGER NOT NULL,
  "courseType" TEXT NOT NULL,
  "termName" TEXT NOT NULL,
  "termYear" INTEGER NOT NULL,
  "totalPct" DOUBLE PRECISION NOT NULL,
  "grade" TEXT NOT NULL,
  "gpaPoints" DOUBLE PRECISION,
  "cloAttainmentJson" TEXT NOT NULL,
  "ploAttainmentJson" TEXT NOT NULL,
  "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "StudentTranscriptRecord_studentId_idx" ON "StudentTranscriptRecord"("studentId");
CREATE INDEX IF NOT EXISTS "StudentTranscriptRecord_coordinatorId_idx" ON "StudentTranscriptRecord"("coordinatorId");
-- Run in Supabase SQL Editor. Adds maxDegreePrograms on User (set on
-- Chairman accounts by the Super User) — the number of distinct Degree
-- Programs that institution is licensed to create. NULL means unlimited.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "maxDegreePrograms" INTEGER;
-- Run in Supabase SQL Editor. Adds the full stakeholder feedback survey
-- system: Alumni and Employer contact records, survey templates with
-- PLO-mapped questions, and token-based (no-login) response collection —
-- used to compute indirect PLO attainment alongside direct attainment.

CREATE TABLE IF NOT EXISTS "Alumni" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "coordinatorId" TEXT NOT NULL REFERENCES "User"("id"),
  "name" TEXT NOT NULL,
  "email" TEXT,
  "degreeProgram" TEXT NOT NULL,
  "graduationYear" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Alumni' AND column_name = 'coordinatorId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS "Alumni_coordinatorId_idx" ON "Alumni"("coordinatorId")';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Employer" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "coordinatorId" TEXT NOT NULL REFERENCES "User"("id"),
  "organizationName" TEXT NOT NULL,
  "contactName" TEXT,
  "contactEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Employer' AND column_name = 'coordinatorId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS "Employer_coordinatorId_idx" ON "Employer"("coordinatorId")';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "SurveyTemplate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "coordinatorId" TEXT NOT NULL REFERENCES "User"("id"),
  "title" TEXT NOT NULL,
  "stakeholderType" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SurveyTemplate_coordinatorId_idx" ON "SurveyTemplate"("coordinatorId");

CREATE TABLE IF NOT EXISTS "SurveyQuestion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "surveyTemplateId" TEXT NOT NULL REFERENCES "SurveyTemplate"("id"),
  "text" TEXT NOT NULL,
  "mappedPloId" TEXT REFERENCES "PLO"("id"),
  "orderIndex" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "SurveyQuestion_surveyTemplateId_idx" ON "SurveyQuestion"("surveyTemplateId");

CREATE TABLE IF NOT EXISTS "SurveyResponse" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "surveyTemplateId" TEXT NOT NULL REFERENCES "SurveyTemplate"("id"),
  "token" TEXT NOT NULL UNIQUE,
  "respondentType" TEXT NOT NULL,
  "respondentLabel" TEXT NOT NULL,
  "studentId" TEXT REFERENCES "Student"("id"),
  "alumniId" TEXT REFERENCES "Alumni"("id"),
  "employerId" TEXT REFERENCES "Employer"("id"),
  "submittedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SurveyResponse_surveyTemplateId_idx" ON "SurveyResponse"("surveyTemplateId");
CREATE INDEX IF NOT EXISTS "SurveyResponse_token_idx" ON "SurveyResponse"("token");

CREATE TABLE IF NOT EXISTS "SurveyAnswer" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "surveyResponseId" TEXT NOT NULL REFERENCES "SurveyResponse"("id"),
  "questionId" TEXT NOT NULL REFERENCES "SurveyQuestion"("id"),
  "ratingValue" INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "SurveyAnswer_surveyResponseId_questionId_key" ON "SurveyAnswer"("surveyResponseId", "questionId");
-- Run in Supabase SQL Editor. Adds targetPct to CLO — the faculty-set %
-- of students expected to attain each CO, used by the new Program
-- Attainment Analytics dashboard (target vs actual, NBA-style levels).

ALTER TABLE "CLO" ADD COLUMN IF NOT EXISTS "targetPct" INTEGER NOT NULL DEFAULT 60;
-- Run in Supabase SQL Editor. Adds PassingCriteria — OMC-configurable
-- CLO/PLO attainment threshold per institution, defaulting to 50% for
-- both if never set. Used everywhere pass/fail is computed: Result Mate,
-- CLO/PLO Pass Rates, Program Attainment Analytics, and transcripts.

CREATE TABLE IF NOT EXISTS "PassingCriteria" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "chairmanId" TEXT NOT NULL UNIQUE,
  "cloPassingPct" INTEGER NOT NULL DEFAULT 50,
  "ploPassingPct" INTEGER NOT NULL DEFAULT 50
);
-- Run in Supabase SQL Editor. Adds LandingPageContent — a single-row table
-- holding the public marketing page's editable text, managed by the Super
-- User. No schema changes were needed for the batch-transcript /
-- PLO-remediation feature — it reuses existing tables.

CREATE TABLE IF NOT EXISTS "LandingPageContent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "headline" TEXT NOT NULL DEFAULT 'Outcome-Based Education Governance, Built for Accreditation',
  "subheadline" TEXT NOT NULL DEFAULT 'Design, deliver, and prove learning outcomes across your entire institution — from curriculum to classroom to accreditation report.',
  "aboutText" TEXT NOT NULL DEFAULT '',
  "missionText" TEXT NOT NULL DEFAULT '',
  "contactEmail" TEXT,
  "contactPhone" TEXT,
  "pricingNote" TEXT NOT NULL DEFAULT '',
  "featuresJson" TEXT NOT NULL DEFAULT '[]',
  "testimonialsJson" TEXT NOT NULL DEFAULT '[]',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Run in Supabase SQL Editor. Brings Alumni/Employer/AlumniEmployment up
-- to the current full design, safely regardless of which earlier version
-- of this feature (if any) your database currently has:
--   1. Adds rollNumber, companySize, industryType, totalWorkExperienceYears,
--      addedById if missing (these predate this migration in some deploys).
--   2. Creates AlumniEmployment if it doesn't exist yet.
--   3. Renames coordinatorId -> chairmanId on Alumni/Employer (institution-
--      wide scope, since any faculty across any Coordinator under one
--      Chairman now shares one pool) — existing data is preserved.
--   4. Adds the approval workflow: status/reviewedById/reviewNote on all
--      three tables, and isAlumniCustodian on User.
--
-- NOTE: if your Coordinators and Chairmen are different user accounts,
-- existing Alumni/Employer rows will be re-scoped to whatever "chairmanId"
-- ends up holding after the rename (their old coordinatorId value) — you
-- may need to manually correct this afterward if that's not the right owner.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isAlumniCustodian" BOOLEAN NOT NULL DEFAULT false;

-- --- Alumni: bring up to full shape ---
ALTER TABLE "Alumni" ADD COLUMN IF NOT EXISTS "rollNumber" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Alumni" ADD COLUMN IF NOT EXISTS "totalWorkExperienceYears" INTEGER;
ALTER TABLE "Alumni" ADD COLUMN IF NOT EXISTS "addedById" TEXT;
ALTER TABLE "Alumni" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Alumni" ADD COLUMN IF NOT EXISTS "reviewedById" TEXT;
ALTER TABLE "Alumni" ADD COLUMN IF NOT EXISTS "reviewNote" TEXT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Alumni' AND column_name = 'coordinatorId') THEN
    ALTER TABLE "Alumni" RENAME COLUMN "coordinatorId" TO "chairmanId";
  END IF;
END $$;
ALTER TABLE "Alumni" ADD COLUMN IF NOT EXISTS "chairmanId" TEXT;
DROP INDEX IF EXISTS "Alumni_coordinatorId_idx";
DROP INDEX IF EXISTS "Alumni_coordinatorId_rollNumber_key";
CREATE INDEX IF NOT EXISTS "Alumni_chairmanId_idx" ON "Alumni"("chairmanId");
CREATE UNIQUE INDEX IF NOT EXISTS "Alumni_chairmanId_rollNumber_key" ON "Alumni"("chairmanId", "rollNumber");

-- --- Employer: bring up to full shape ---
ALTER TABLE "Employer" ADD COLUMN IF NOT EXISTS "companySize" TEXT;
ALTER TABLE "Employer" ADD COLUMN IF NOT EXISTS "industryType" TEXT;
ALTER TABLE "Employer" ADD COLUMN IF NOT EXISTS "addedById" TEXT;
ALTER TABLE "Employer" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Employer" ADD COLUMN IF NOT EXISTS "reviewedById" TEXT;
ALTER TABLE "Employer" ADD COLUMN IF NOT EXISTS "reviewNote" TEXT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Employer' AND column_name = 'coordinatorId') THEN
    ALTER TABLE "Employer" RENAME COLUMN "coordinatorId" TO "chairmanId";
  END IF;
END $$;
ALTER TABLE "Employer" ADD COLUMN IF NOT EXISTS "chairmanId" TEXT;
DROP INDEX IF EXISTS "Employer_coordinatorId_idx";
DROP INDEX IF EXISTS "Employer_coordinatorId_organizationName_key";
CREATE INDEX IF NOT EXISTS "Employer_chairmanId_idx" ON "Employer"("chairmanId");
CREATE UNIQUE INDEX IF NOT EXISTS "Employer_chairmanId_organizationName_key" ON "Employer"("chairmanId", "organizationName");

-- --- AlumniEmployment: create if missing, else bring up to full shape ---
CREATE TABLE IF NOT EXISTS "AlumniEmployment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "alumniId" TEXT NOT NULL REFERENCES "Alumni"("id"),
  "employerId" TEXT NOT NULL REFERENCES "Employer"("id"),
  "jobTitle" TEXT,
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "salaryRange" TEXT,
  "addedById" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reviewedById" TEXT,
  "reviewNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "AlumniEmployment" ADD COLUMN IF NOT EXISTS "addedById" TEXT;
ALTER TABLE "AlumniEmployment" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "AlumniEmployment" ADD COLUMN IF NOT EXISTS "reviewedById" TEXT;
ALTER TABLE "AlumniEmployment" ADD COLUMN IF NOT EXISTS "reviewNote" TEXT;
CREATE INDEX IF NOT EXISTS "AlumniEmployment_alumniId_idx" ON "AlumniEmployment"("alumniId");
CREATE INDEX IF NOT EXISTS "AlumniEmployment_employerId_idx" ON "AlumniEmployment"("employerId");
-- Run in Supabase SQL Editor. Adds the "closing the loop" mechanism:
-- structured source-linking and before/after verification on CqiRecord,
-- and PEO-mapping on survey questions (alongside the existing PLO mapping).

ALTER TABLE "CqiRecord" ADD COLUMN IF NOT EXISTS "sourceType" TEXT;
ALTER TABLE "CqiRecord" ADD COLUMN IF NOT EXISTS "sourceReference" TEXT;
ALTER TABLE "CqiRecord" ADD COLUMN IF NOT EXISTS "metricBefore" DOUBLE PRECISION;
ALTER TABLE "CqiRecord" ADD COLUMN IF NOT EXISTS "metricAfter" DOUBLE PRECISION;
ALTER TABLE "CqiRecord" ADD COLUMN IF NOT EXISTS "verifiedById" TEXT;
ALTER TABLE "CqiRecord" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3);

ALTER TABLE "SurveyQuestion" ADD COLUMN IF NOT EXISTS "mappedPeoLabel" TEXT;
-- Run in Supabase SQL Editor. Adds CLO.orderIndex, and backfills it for any
-- existing CLOs based on their current code's natural sort order — without
-- this backfill, every existing row would default to orderIndex 0 and the
-- move-up/move-down buttons would think every CLO is both first and last.

ALTER TABLE "CLO" ADD COLUMN IF NOT EXISTS "orderIndex" INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "courseId", "source" ORDER BY "code" ASC) - 1 AS rn
  FROM "CLO"
)
UPDATE "CLO"
SET "orderIndex" = ranked.rn
FROM ranked
WHERE "CLO"."id" = ranked."id";

-- Also clean up existing messy codes ("CLO 1", "CLO1", "clo-1"...) into the
-- consistent "CLO-N" format, matching the new orderIndex — this is the same
-- inconsistency the auto-numbering feature exists to prevent going forward.
-- Two-phase update avoids tripping the @@unique([courseId, source, code])
-- constraint mid-rewrite.
UPDATE "CLO" SET "code" = 'TEMP-' || "id";
UPDATE "CLO" SET "code" = 'CLO-' || ("orderIndex" + 1);
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
-- Run in Supabase SQL Editor. Adds AlumniAdditionalDegree — further
-- education (MS, PhD, certifications) an alumnus completed after
-- graduating from this institution, going through the same
-- submit-then-approve workflow as everything else in this system.

CREATE TABLE IF NOT EXISTS "AlumniAdditionalDegree" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "alumniId" TEXT NOT NULL REFERENCES "Alumni"("id"),
  "degreeName" TEXT NOT NULL,
  "institution" TEXT NOT NULL,
  "completionYear" INTEGER,
  "addedById" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reviewedById" TEXT,
  "reviewNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AlumniAdditionalDegree_alumniId_idx" ON "AlumniAdditionalDegree"("alumniId");
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
-- Run in Supabase SQL Editor. Adds the full Timetable module: rooms,
-- schedulable sections, per-batch scheduling windows, faculty
-- unavailability (both PC-set and self-set), and generated timetable runs
-- with their entries.

CREATE TABLE IF NOT EXISTS "Room" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "chairmanId" TEXT NOT NULL REFERENCES "User"("id"),
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "capacity" INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "Room_chairmanId_name_key" ON "Room"("chairmanId", "name");
CREATE INDEX IF NOT EXISTS "Room_chairmanId_idx" ON "Room"("chairmanId");

CREATE TABLE IF NOT EXISTS "ScheduleSection" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "courseId" TEXT NOT NULL REFERENCES "Course"("id"),
  "instructorId" TEXT NOT NULL REFERENCES "User"("id"),
  "sectionLabel" TEXT NOT NULL DEFAULT 'Section A',
  "sessionsPerWeek" INTEGER NOT NULL DEFAULT 3,
  "sessionDurationMinutes" INTEGER NOT NULL DEFAULT 60,
  "roomTypeNeeded" TEXT NOT NULL DEFAULT 'LECTURE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ScheduleSection_courseId_idx" ON "ScheduleSection"("courseId");
CREATE INDEX IF NOT EXISTS "ScheduleSection_instructorId_idx" ON "ScheduleSection"("instructorId");

CREATE TABLE IF NOT EXISTS "BatchScheduleConfig" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "batchId" TEXT NOT NULL UNIQUE REFERENCES "Batch"("id"),
  "workingDaysJson" TEXT NOT NULL DEFAULT '["Mon","Tue","Wed","Thu","Fri"]',
  "dailyStartHour" INTEGER NOT NULL DEFAULT 8,
  "dailyEndHour" INTEGER NOT NULL DEFAULT 16
);

CREATE TABLE IF NOT EXISTS "FacultyUnavailability" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "facultyId" TEXT NOT NULL REFERENCES "User"("id"),
  "dayOfWeek" TEXT NOT NULL,
  "startHour" DOUBLE PRECISION NOT NULL,
  "endHour" DOUBLE PRECISION NOT NULL,
  "setById" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "FacultyUnavailability_facultyId_idx" ON "FacultyUnavailability"("facultyId");

CREATE TABLE IF NOT EXISTS "TimetableRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "chairmanId" TEXT NOT NULL REFERENCES "User"("id"),
  "generatedById" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "fitnessScore" DOUBLE PRECISION,
  "hardViolations" INTEGER,
  "generations" INTEGER,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "TimetableRun_chairmanId_idx" ON "TimetableRun"("chairmanId");

CREATE TABLE IF NOT EXISTS "TimetableEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "timetableRunId" TEXT NOT NULL REFERENCES "TimetableRun"("id"),
  "scheduleSectionId" TEXT NOT NULL REFERENCES "ScheduleSection"("id"),
  "roomId" TEXT NOT NULL REFERENCES "Room"("id"),
  "dayOfWeek" TEXT NOT NULL,
  "startHour" DOUBLE PRECISION NOT NULL,
  "endHour" DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS "TimetableEntry_timetableRunId_idx" ON "TimetableEntry"("timetableRunId");
CREATE INDEX IF NOT EXISTS "TimetableEntry_scheduleSectionId_idx" ON "TimetableEntry"("scheduleSectionId");
CREATE INDEX IF NOT EXISTS "TimetableEntry_roomId_idx" ON "TimetableEntry"("roomId");
-- Run in Supabase SQL Editor. Adds Batch.prerequisitesConfirmedAt — set
-- once the Coordinator confirms they've reviewed/set up that batch's
-- Prerequisite Map. Offer Semester now requires this before offering any
-- of that batch's courses.

ALTER TABLE "Batch" ADD COLUMN IF NOT EXISTS "prerequisitesConfirmedAt" TIMESTAMP(3);
-- Run in Supabase SQL Editor. Upgrades TimetableRun to support background,
-- resumable generation: a run can now sit in RUNNING/STOPPED status with
-- its best-so-far chromosome saved between polling calls, instead of only
-- ever being a single-shot COMPLETED/FAILED result.

ALTER TABLE "TimetableRun" ALTER COLUMN "status" SET DEFAULT 'RUNNING';
ALTER TABLE "TimetableRun" ADD COLUMN IF NOT EXISTS "bestChromosomeJson" TEXT;
ALTER TABLE "TimetableRun" ADD COLUMN IF NOT EXISTS "targetEndTime" TIMESTAMP(3);
ALTER TABLE "TimetableRun" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- Run in Supabase SQL Editor. Adds DegreeProgram — set up once per
-- Coordinator (name, short code, default intake size, which terms it's
-- usually offered in), then reused every semester to bulk-create that
-- term's intake batches via checkboxes instead of retyping names.

CREATE TABLE IF NOT EXISTS "DegreeProgram" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "coordinatorId" TEXT NOT NULL REFERENCES "User"("id"),
  "name" TEXT NOT NULL,
  "shortCode" TEXT NOT NULL,
  "defaultIntakeSize" INTEGER NOT NULL DEFAULT 30,
  "usuallyOfferedInFall" BOOLEAN NOT NULL DEFAULT true,
  "usuallyOfferedInSpring" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "DegreeProgram_coordinatorId_shortCode_key" ON "DegreeProgram"("coordinatorId", "shortCode");
CREATE INDEX IF NOT EXISTS "DegreeProgram_coordinatorId_idx" ON "DegreeProgram"("coordinatorId");
-- Run in Supabase SQL Editor. Makes grading scales versioned by effective
-- date, so introducing a new scale (e.g. after an HEC policy change) only
-- applies to batches starting from that point on — batches already
-- running under the old scale keep their original GPA mapping.
--
-- Existing rows get effectiveFromTerm='Fall', effectiveFromYear=2000 (a
-- deliberately early default) so they keep applying to every batch that
-- already exists, exactly as before this change.

ALTER TABLE "GradingScale" ADD COLUMN IF NOT EXISTS "effectiveFromTerm" TEXT NOT NULL DEFAULT 'Fall';
ALTER TABLE "GradingScale" ADD COLUMN IF NOT EXISTS "effectiveFromYear" INTEGER NOT NULL DEFAULT 2000;

DROP INDEX IF EXISTS "GradingScale_coordinatorId_letter_key";
CREATE UNIQUE INDEX IF NOT EXISTS "GradingScale_coordinatorId_letter_effectiveFromTerm_effectiveFromYear_key"
  ON "GradingScale"("coordinatorId", "letter", "effectiveFromTerm", "effectiveFromYear");
-- Run in Supabase SQL Editor. Adds Course.instructorObservations — the
-- free-text notes field for the Course Evaluation Form, filled in by the
-- Instructor and included in the downloadable Word document.

ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "instructorObservations" TEXT;
-- Run in Supabase SQL Editor. Adds textbook/catalogDescription/
-- referenceMaterial to MasterCourse — these now flow into every Course
-- created from this template on import, same as CLOs already do,
-- instead of starting empty every time.

ALTER TABLE "MasterCourse" ADD COLUMN IF NOT EXISTS "textbook" TEXT;
ALTER TABLE "MasterCourse" ADD COLUMN IF NOT EXISTS "catalogDescription" TEXT;
ALTER TABLE "MasterCourse" ADD COLUMN IF NOT EXISTS "referenceMaterial" TEXT;
-- Run in Supabase SQL Editor. Adds HecPloSuggestion — HEC's own suggested
-- course-to-PLO mapping, used by the "Auto-Map from HEC" button to
-- bulk-create real CoursePloMapping records for a batch.

CREATE TABLE IF NOT EXISTS "HecPloSuggestion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "courseCode" TEXT NOT NULL,
  "ploNumber" INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "HecPloSuggestion_courseCode_ploNumber_key" ON "HecPloSuggestion"("courseCode", "ploNumber");
CREATE INDEX IF NOT EXISTS "HecPloSuggestion_courseCode_idx" ON "HecPloSuggestion"("courseCode");
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
-- Run in Supabase SQL Editor. Adds CourseShortName — a chairman-scoped,
-- purely cosmetic short display name per course code, used only in the
-- Section Assignment Matrix instead of the automatic first-3-letters
-- abbreviation.

CREATE TABLE IF NOT EXISTS "CourseShortName" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "chairmanId" TEXT NOT NULL REFERENCES "User"("id"),
  "courseCode" TEXT NOT NULL,
  "shortName" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CourseShortName_chairmanId_courseCode_key" ON "CourseShortName"("chairmanId", "courseCode");
-- Run in Supabase SQL Editor. Adds CourseContentSyncGroup and
-- CourseContentSyncMember — a link (separate from CourseEquivalence)
-- where a Subject Expert's saved changes on one course automatically
-- propagate to every other linked course.

CREATE TABLE IF NOT EXISTS "CourseContentSyncGroup" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "chairmanId" TEXT NOT NULL REFERENCES "User"("id"),
  "createdById" TEXT,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CourseContentSyncGroup_chairmanId_idx" ON "CourseContentSyncGroup"("chairmanId");

CREATE TABLE IF NOT EXISTS "CourseContentSyncMember" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "groupId" TEXT NOT NULL REFERENCES "CourseContentSyncGroup"("id"),
  "courseId" TEXT NOT NULL UNIQUE REFERENCES "Course"("id"),
  "isBase" BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS "CourseContentSyncMember_groupId_idx" ON "CourseContentSyncMember"("groupId");
-- Enforces exactly one base course per group at the DB level too, not
-- just in application code.
CREATE UNIQUE INDEX IF NOT EXISTS "CourseContentSyncMember_one_base_per_group"
  ON "CourseContentSyncMember"("groupId") WHERE "isBase" = true;

-- Added later: linking courses no longer copies content immediately —
-- that was the actual source of "Accept All takes hours". A group is
-- flagged as needing a sync whenever its membership/base changes; the
-- explicit "Sync All Content" action clears the flag once it actually
-- runs the copy.
ALTER TABLE "CourseContentSyncGroup" ADD COLUMN IF NOT EXISTS "needsSync" BOOLEAN NOT NULL DEFAULT true;
-- Scopes MasterCurriculum by owning chairman — null means the shared,
-- official reference copy (visible to everyone, never directly
-- editable by OMC); set means a specific chairman's own clone, freely
-- editable by their OMC, invisible to every other chairman.
ALTER TABLE "MasterCurriculum" ADD COLUMN IF NOT EXISTS "chairmanId" TEXT;
-- Postgres has no "ADD CONSTRAINT IF NOT EXISTS" — this is the standard
-- idiom for the same idempotent effect.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MasterCurriculum_chairmanId_fkey') THEN
    ALTER TABLE "MasterCurriculum" ADD CONSTRAINT "MasterCurriculum_chairmanId_fkey"
      FOREIGN KEY ("chairmanId") REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "MasterCurriculum_chairmanId_idx" ON "MasterCurriculum"("chairmanId");

-- Adds PLO mapping to MasterCourseClo, mirroring the real CLO model's
-- mappedPloId — one primary PLO per CLO.
ALTER TABLE "MasterCourseClo" ADD COLUMN IF NOT EXISTS "mappedPloId" TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MasterCourseClo_mappedPloId_fkey') THEN
    ALTER TABLE "MasterCourseClo" ADD CONSTRAINT "MasterCourseClo_mappedPloId_fkey"
      FOREIGN KEY ("mappedPloId") REFERENCES "MasterPLO"(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "MasterCourseClo_mappedPloId_idx" ON "MasterCourseClo"("mappedPloId");

-- Supports program-specific copies of the grand HEC master curriculum
-- (e.g. "BS Artificial Intelligence" built from "BS Computer Science -
-- HEC 2025"), tracked back to their source for the sync mechanism.
ALTER TABLE "MasterCurriculum" ADD COLUMN IF NOT EXISTS "degreeProgram" TEXT;
ALTER TABLE "MasterCurriculum" ADD COLUMN IF NOT EXISTS "parentCurriculumId" TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MasterCurriculum_parentCurriculumId_fkey') THEN
    ALTER TABLE "MasterCurriculum" ADD CONSTRAINT "MasterCurriculum_parentCurriculumId_fkey"
      FOREIGN KEY ("parentCurriculumId") REFERENCES "MasterCurriculum"(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "MasterCurriculum_parentCurriculumId_idx" ON "MasterCurriculum"("parentCurriculumId");

-- A proper domain field for grouping Domain Elective courses (AI,
-- Cyber Security, Data Science, etc.) when building program-specific
-- copies of a grand master curriculum, rather than parsing it out of
-- free-text catalogDescription.
ALTER TABLE "MasterCourse" ADD COLUMN IF NOT EXISTS "domain" TEXT;

-- Distinguishes HEC-sourced PLO mappings (the official document itself
-- tagged the CLO) from system-suggested ones (inferred from the CLO's
-- wording by keyword rules) — shown differently in the Course-PLO
-- matrix so the two are never confused.
ALTER TABLE "MasterCourseClo" ADD COLUMN IF NOT EXISTS "ploMappingSource" TEXT;

-- Course prerequisite within the same master curriculum, mirroring the
-- real Course model's self-referencing prerequisiteCourseId.
ALTER TABLE "MasterCourse" ADD COLUMN IF NOT EXISTS "prerequisiteCourseId" TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MasterCourse_prerequisiteCourseId_fkey') THEN
    ALTER TABLE "MasterCourse" ADD CONSTRAINT "MasterCourse_prerequisiteCourseId_fkey"
      FOREIGN KEY ("prerequisiteCourseId") REFERENCES "MasterCourse"(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "MasterCourse_prerequisiteCourseId_idx" ON "MasterCourse"("prerequisiteCourseId");

-- Staging tables for the "equate courses" review workflow: newly
-- fetched/researched courses wait here for Super User review before
-- being permanently embedded in a master curriculum.
CREATE TABLE IF NOT EXISTS "PendingMasterCourse" (
  id TEXT PRIMARY KEY,
  "masterCurriculumId" TEXT NOT NULL REFERENCES "MasterCurriculum"(id),
  title TEXT NOT NULL,
  "suggestedCode" TEXT,
  category TEXT,
  domain TEXT,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "PendingMasterCourse_masterCurriculumId_idx" ON "PendingMasterCourse"("masterCurriculumId");
CREATE INDEX IF NOT EXISTS "PendingMasterCourse_status_idx" ON "PendingMasterCourse"(status);

CREATE TABLE IF NOT EXISTS "PendingMasterCourseClo" (
  id TEXT PRIMARY KEY,
  "pendingMasterCourseId" TEXT NOT NULL REFERENCES "PendingMasterCourse"(id),
  statement TEXT NOT NULL,
  "bloomLevel" TEXT NOT NULL,
  "orderIndex" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "PendingMasterCourseClo_pendingMasterCourseId_idx" ON "PendingMasterCourseClo"("pendingMasterCourseId");

-- DotAI-style evidence: a rubric/paper/project attached to an
-- assessment instrument, checked against the CLOs it's meant to
-- measure — AI-checked when configured, deterministic fallback
-- otherwise, so a review is never blocked.
CREATE TABLE IF NOT EXISTS "InstrumentEvidence" (
  id TEXT PRIMARY KEY,
  "instrumentId" TEXT NOT NULL REFERENCES "AssessmentInstrument"(id),
  "fileName" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "uploadedByUserId" TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  method TEXT,
  reasoning TEXT,
  "checkedCloIds" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "validatedAt" TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "InstrumentEvidence_instrumentId_idx" ON "InstrumentEvidence"("instrumentId");

-- Per-institution AI configuration — lets a Chairman bring their own
-- provider/model/API key rather than relying on the platform-wide one.
CREATE TABLE IF NOT EXISTS "AiConfig" (
  id TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL UNIQUE REFERENCES "User"(id),
  provider TEXT NOT NULL DEFAULT 'anthropic',
  "apiKey" TEXT,
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  enabled BOOLEAN NOT NULL DEFAULT false,
  "lastTestedAt" TIMESTAMP,
  "lastTestOk" BOOLEAN,
  "lastTestNote" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);
-- Run in Supabase SQL Editor (safe to run more than once).
-- Adds curriculum tracks (e.g. Non-Medical / Pre-Medical) and non-credit
-- deficiency courses (e.g. Maths-I / Maths-II for pre-medical entrants).

-- Course: which track takes it (NULL = everyone), non-credit flag, weekly contact hours override.
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "trackName" TEXT;
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "isNonCredit" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "contactHours" INTEGER;

-- Student: the track they follow. Existing students become "Non-Medical".
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "track" TEXT NOT NULL DEFAULT 'Non-Medical';

-- Pass mark for deficiency courses (versioned with the other passing criteria).
ALTER TABLE "PassingCriteria" ADD COLUMN IF NOT EXISTS "deficiencyPassingPct" INTEGER NOT NULL DEFAULT 40;

-- Run in Supabase SQL Editor (safe to run more than once).
-- Public course library + platform (master-curriculum) Subject Experts.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "organization" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isPlatformExpert" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "MasterCourse" ADD COLUMN IF NOT EXISTS "designerId" TEXT;
DO $$ BEGIN
  ALTER TABLE "MasterCourse" ADD CONSTRAINT "MasterCourse_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "PublicCourse" (
  "id" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "sourceCourseId" TEXT,
  "plan" TEXT NOT NULL DEFAULT 'SE',
  "instituteName" TEXT,
  "authorOrganization" TEXT,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "creditHours" INTEGER NOT NULL,
  "courseType" TEXT NOT NULL DEFAULT 'Core',
  "summary" TEXT,
  "searchText" TEXT NOT NULL,
  "snapshotJson" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewComment" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "importCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublicCourse_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PublicCourse_status_idx" ON "PublicCourse"("status");
CREATE INDEX IF NOT EXISTS "PublicCourse_authorId_idx" ON "PublicCourse"("authorId");
DO $$ BEGIN
  ALTER TABLE "PublicCourse" ADD CONSTRAINT "PublicCourse_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "PublicCourseImport" (
  "id" TEXT NOT NULL,
  "publicCourseId" TEXT NOT NULL,
  "importedById" TEXT NOT NULL,
  "importedIntoCourseId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublicCourseImport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PublicCourseImport_publicCourseId_idx" ON "PublicCourseImport"("publicCourseId");
DO $$ BEGIN
  ALTER TABLE "PublicCourseImport" ADD CONSTRAINT "PublicCourseImport_publicCourseId_fkey" FOREIGN KEY ("publicCourseId") REFERENCES "PublicCourse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Faculty preferred teaching days (soft preference for the timetable generator)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "preferredDays" TEXT;
-- Course library from Prospectus 2024-25 (all degrees in the file). No CLOs / PLOs: codes, titles, credit hours and plan only.
-- Official (shared) master curricula. Safe to re-run: a curriculum that already exists is skipped.

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='BS Computer Science (BSCS)' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'BS Computer Science (BSCS)', '2024-25', 'Prospectus 2024-25, Software Engineering department. Course list only - no CLOs/PLOs.', 'PUBLISHED', 'BS Computer Science (BSCS)', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CSC1011', 'Programming Fundamentals', 4, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER100', 'Application of Information & Communication Technologies', 3, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER300', 'QR 1 (Discrete Structures)', 3, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER500', 'Social Science (Introduction to Management)', 2, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER301', 'QR 2 (Calculus and Analytic Geometry)', 3, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER200', 'Functional English', 3, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CSC1012', 'Object Oriented Programming', 4, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CSC1021', 'Database Systems', 4, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEN1012', 'Digital Logic Design', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2402', 'Civics and Community Engagement', 2, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2400', 'Islamic Studies', 2, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MTH1021', 'Linear Algebra', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CSC2034', 'Data Structures', 4, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-001', 'Domain Core 2', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MTH2002', 'Multivariable Calculus', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2800', 'Entrepreneurship', 2, 'General Education', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2700', 'Arts & Humanities (Professional Practices)', 2, 'General Education', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'SEN2001', 'Software Engineering', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CSC2011', 'Computer Organization & Assembly Language', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2401', 'Ideology and Constitution of Pakistan', 2, 'General Education', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'STT2001', 'Probability & Statistics', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2600', 'Natural Science (Applied Physics)', 3, 'General Education', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CSC2041', 'Artificial Intelligence', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1201', 'Expository Writing', 3, 'General Education', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-002', 'Domain Core 4', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CSC3112', 'Operating Systems', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-003', 'Domain Core 1', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-004', 'Domain Elective 1', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CSC3123', 'Computer Networks', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-005', 'Domain Core 5', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-006', 'Domain Elective 3', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-007', 'Domain Elective 2', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-008', 'Domain Elective 5', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-009', 'Domain Core 3', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'SEN4996', 'Final Year Project – I', 2, 'Capstone Project', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CSC4032', 'Analysis of Algorithms', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-010', 'Domain Elective 7', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CSC4125', 'Information Security', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG4021', 'Technical & Business Writing', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-011', 'Domain Elective 4', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'SEN4997', 'Final Year Project – II', 4, 'Capstone Project', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-012', 'Domain Elective 6', 3, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-013', 'Elective Supporting Course', 3, 'Elective', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-014', 'Domain Core 6', 3, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-015', 'Internship (optional)', 0, 'Field Experience', 'Summer (after Semester 4)', NULL, 'Credit hours not printed in the prospectus - set before use. After completing 4th semester');
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='BS Software Engineering (BSSE)' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'BS Software Engineering (BSSE)', '2024-25', 'Prospectus 2024-25, Software Engineering department. Course list only - no CLOs/PLOs.', 'PUBLISHED', 'BS Software Engineering (BSSE)', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-001', 'Programming Fundamentals (PF)', 4, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-002', 'Application of Information & Communication Technologies', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-003', 'Discrete Structures (DS)', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-004', 'Calculus and Analytic Geometry (CAG)', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-005', 'Functional English', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-006', 'Object Oriented Programming (OOP)', 4, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-007', 'Database Systems', 4, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-008', 'Digital Logic Design', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-009', 'Multivariable Calculus', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-010', 'Linear Algebra', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-011', 'Data Structures', 4, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-012', 'Information Security', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-013', 'Artificial Intelligence', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-014', 'Computer Networks', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-015', 'Software Engineering', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-016', 'Computer Organization & Assembly Language', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-017', 'Software Design & Architecture (Domain Core 1)', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-018', 'Software Construction & Development (Domain Core 2)', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-019', 'Applied Physics', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-020', 'Expository Writing', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-021', 'Islamic Studies', 2, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-022', 'Operating Systems', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-023', 'Software Quality Engineering (Domain Core 3)', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-024', 'Software Requirement Engineering (Domain Core 4)', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-025', 'Domain Elective 1', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-026', 'Domain Elective 2', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-027', 'Social Science (e.g. Introduction to Management)', 2, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-028', 'Software Project Management (Domain Core 5)', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-029', 'Parallel & Distributed Computing (Domain Core 6)', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-030', 'Domain Elective 3', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-031', 'Domain Elective 4', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-032', 'Domain Elective 5', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-033', 'Domain Elective 6', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-034', 'Final Year Project - I', 2, 'Capstone Project', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-035', 'Analysis of Algorithms', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-036', 'Domain Elective 7', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-037', 'Elective Supporting Course (e.g. Introduction to Marketing)', 3, 'Elective', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-038', 'Technical & Business Writing', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-039', 'Entrepreneurship', 2, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-040', 'Final Year Project - II', 4, 'Capstone Project', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-041', 'Ideology and Constitution of Pakistan', 2, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-042', 'Arts & Humanities (Professional Practices)', 2, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-043', 'Civics and Community Engagement', 2, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-044', 'Internship (optional)', 0, 'Field Experience', 'Summer (after Semester 4)', NULL, 'Credit hours not printed in the prospectus - set before use. After completing 4th semester');
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='MS Computer Science' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'MS Computer Science', '2024-25', 'Prospectus 2024-25, Software Engineering department. Course list only - no CLOs/PLOs.', 'PUBLISHED', 'MS Computer Science', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-001', 'Core-I', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-002', 'Core-II', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-003', 'Elective-I', 3, 'Elective', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-004', 'Core-III', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-005', 'Core-IV', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-006', 'Elective-II', 3, 'Elective', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CSC6001', 'Research Methodology', 1, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-007', 'Elective-III', 3, 'Elective', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CSC7099', 'Thesis / Elective Course', 6, 'Capstone Project', NULL, 3, 'Credit hours printed as ''6 / 3''.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-008', 'Elective-IV', 3, 'Elective', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CSC7099-B', 'Thesis / Project', 6, 'Capstone Project', NULL, 4, 'Credit hours printed as ''6 / 3''.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CSC6301', 'Advanced Analysis of Algorithms', 3, 'Major', 'Core course list (Core-I to IV)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CSC6201', 'Advanced Operating Systems', 3, 'Major', 'Core course list (Core-I to IV)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CSC6321', 'Theory of Programming Languages', 3, 'Major', 'Core course list (Core-I to IV)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CEN6401', 'Advanced Computer Architecture', 3, 'Major', 'Core course list (Core-I to IV)', NULL, NULL);
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='MS Software Engineering' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'MS Software Engineering', '2024-25', 'Prospectus 2024-25, Software Engineering department. Course list only - no CLOs/PLOs.', 'PUBLISHED', 'MS Software Engineering', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-001', 'Core-I', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-002', 'Core-II', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-003', 'Elective-I', 3, 'Elective', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-004', 'Core-III', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-005', 'Elective-II', 3, 'Elective', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-006', 'Elective-III', 3, 'Elective', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CSC6001', 'Research Methodology', 1, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-007', 'Elective-IV', 3, 'Elective', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CSC7099', 'Thesis / Elective Course', 6, 'Capstone Project', NULL, 3, 'Credit hours printed as ''6 / 3''.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-008', 'Elective-V', 3, 'Elective', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CSC7099-B', 'Thesis / Project', 6, 'Capstone Project', NULL, 4, 'Credit hours printed as ''6 / 3''.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'SEN6013', 'Advanced Requirements Engineering', 3, 'Major', 'Core course list (Core-I to III)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'SEN6014', 'Advanced Software System Architecture', 3, 'Major', 'Core course list (Core-I to III)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'SEN6015', 'Software Testing and Quality Assurance', 3, 'Major', 'Core course list (Core-I to III)', NULL, NULL);
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='PhD Computer Science' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'PhD Computer Science', '2024-25', 'Prospectus 2024-25, Software Engineering department. Course list only - no CLOs/PLOs.', 'PUBLISHED', 'PhD Computer Science', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-001', 'Required / Elective Courses (6 courses)', 18, 'Major', 'Coursework', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-002', 'Research Methodology (non-credit)', 0, 'Major', 'Coursework', NULL, 'Waived if already passed in MS coursework');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-003', 'Thesis', 18, 'Capstone Project', 'Research', NULL, 'Completion of coursework; min CGPA 3.0');
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='B.E.Tech. (Information)' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'B.E.Tech. (Information)', '2024-25', 'Prospectus 2024-25, Engineering Technology department. Course list only - no CLOs/PLOs.', 'PUBLISHED', 'B.E.Tech. (Information)', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1100', 'Application of Information & Communication Technologies', 3, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'IET1001', 'Programming Fundamental', 4, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1304', 'Calculus and Analytic Geometry', 3, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2400', 'Islamic Studies', 2, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1200', 'Functional English', 3, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'IET1022', 'Digital Logic Design', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'IET1003', 'Computer Architecture and Assembly Language', 4, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'IET1002', 'Object Oriented Programming', 4, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2401', 'Ideology and Constitution of Pakistan', 2, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1305', 'Probability and Statistics', 3, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2600', 'Applied Physics', 3, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'IET2031', 'Data Structures and Algorithms', 4, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2700', 'Professional Practices', 2, 'General Education', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'IET2051', 'Computer Networking Technologies', 4, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2800', 'Entrepreneurship', 2, 'General Education', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2402', 'Civics and Community Engagement', 2, 'General Education', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'IET2041', 'Database Systems', 4, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'IET2012', 'Mobile App Development', 4, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'IET2052', 'Introduction to Web Technologies', 4, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2800-B', 'Environmental Sciences', 3, 'General Education', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1203', 'Technical Report Writing', 3, 'General Education', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'IET2042', 'Operating System Principles', 4, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'IET3071', 'Software Engineering', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'IET3031', 'Theory of Automata & Compilers', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'IET3001', 'Technology Project Part 1', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'IET3082', 'Introduction to Data Science', 4, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'IET4051', 'Introduction to Cyber Security', 4, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'IET3002', 'Technology Project Part 2', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'IET3081', 'Machine Learning', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'IET3061', 'Organizational Behavior', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'IET3011', 'Visual Programming', 4, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'IET3083', 'Introduction to Artificial Intelligence', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'IET4092', 'Supervised Industrial Training-I', 16, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'IET4093', 'Supervised Industrial Training-II', 16, 'Major', NULL, 8, NULL);
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='B.E.Tech. (Biomedical)' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'B.E.Tech. (Biomedical)', '2024-25', 'Prospectus 2024-25, Engineering Technology department. Course list only - no CLOs/PLOs.', 'PUBLISHED', 'B.E.Tech. (Biomedical)', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'BMS1002', 'Basic Biology (for Pre-Engineering students)', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MTS1002', 'Basic Mathematics (for Pre-Medical students)', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1200', 'Functional English', 3, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2400', 'Islamic Studies', 2, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2600', 'Applied Physics', 3, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1100', 'Application of Information & Communication Technologies', 3, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE1004', 'Workshop Practice', 1, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE2005', 'Technical Drawing', 1, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1304', 'Calculus and Analytical Geometry', 3, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE1005', 'Basic Electrical Technology', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'BMS1010', 'Human Anatomy & Physiology', 4, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CSC1011', 'Computer Programming', 2, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1500', 'Fundamentals of Management', 2, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2700', 'Professional Practices', 2, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE2030', 'Signals and Systems', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2401', 'Ideology and Constitution of Pakistan', 2, 'General Education', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MTS2003', 'Linear Algebra & Differential Equations', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE2006', 'Electrical Circuit Analysis', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE2020', 'Digital Logic Design', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2402', 'Civic & Community Engagement', 2, 'General Education', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1203', 'Technical Report Writing', 3, 'General Education', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1305', 'Probability and Statistics', 3, 'General Education', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE2007', 'Electronic Devices and Circuits', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE2021', 'Microprocessors and Microcontrollers', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'BMS2011', 'Biochemistry', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2800', 'Entrepreneurship', 2, 'General Education', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'BMT3060', 'Medical Imaging Processing', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG1011', 'Communication Skills', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'BMT3061', 'Biomedical Instrumentation', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'BMT3030', 'Biomedical Control Systems', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'BMT3046', 'Biomechanics', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'BMT3090', 'Project-I', 3, 'Capstone Project', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'BMT3021', 'Medical Imaging Devices', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'BMT3050', 'Biomaterials', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'BMT3022', 'Clinical Laboratory Equipment', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'BMT3044', 'Medical Device Quality System and Standards', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'BMT3042', 'Rehabilitation Techniques', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'BMT3091', 'Project-II', 3, 'Capstone Project', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'BMT4101', 'Supervised Industrial Training-I', 16, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'BMT4102', 'Supervised Industrial Training-II', 16, 'Major', NULL, 8, NULL);
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='BS Electrical Engineering (BSEE)' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'BS Electrical Engineering (BSEE)', '2024-25', 'Prospectus 2024-25, Electrical Engineering department. Course list only - no CLOs/PLOs.', 'PUBLISHED', 'BS Electrical Engineering (BSEE)', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-001', 'Functional English', 0, 'Major', NULL, 1, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-002', 'Calculus and Analytical Geometry', 0, 'Major', NULL, 1, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-003', 'Linear Circuit Analysis', 0, 'Major', NULL, 1, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-004', 'Programming Fundamental', 0, 'Major', NULL, 1, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-005', 'Applied Physics', 0, 'Major', NULL, 1, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-006', 'Engineering Drawing', 0, 'Major', NULL, 1, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-007', 'Differential Equation', 0, 'Major', NULL, 2, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-008', 'Multi Variable Calculus', 0, 'Major', NULL, 2, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-009', 'Technical Writing', 0, 'Major', NULL, 2, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-010', 'Pakistan Studies', 0, 'Major', NULL, 2, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-011', 'Object Oriented Programming', 0, 'Major', NULL, 2, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-012', 'Electronic Devices and Circuit', 0, 'Major', NULL, 2, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-013', 'Occupational Health and Safety', 0, 'Major', NULL, 2, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-014', 'Complex Variable and Transform', 0, 'Major', NULL, 3, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-015', 'Professional Ethics', 0, 'Major', NULL, 3, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-016', 'Digital Logic Design', 0, 'Major', NULL, 3, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-017', 'Algorithms and Data Structures', 0, 'Major', NULL, 3, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-018', 'Electrical Network Analysis', 0, 'Major', NULL, 3, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-019', 'Communications and Presentation Skills', 0, 'Major', NULL, 4, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-020', 'Linear Algebra', 0, 'Major', NULL, 4, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-021', 'Islamic Studies/Ethics', 0, 'Major', NULL, 4, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-022', 'Probability Method in Engineering', 0, 'Major', NULL, 4, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-023', 'Signal and System', 0, 'Major', NULL, 4, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-024', 'Electrical Machines', 0, 'Major', NULL, 5, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-025', 'Civic and Community Engagement', 0, 'Major', NULL, 5, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-026', 'Instrumentation and Measurement', 0, 'Major', NULL, 5, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-027', 'Communication System', 0, 'Major', NULL, 5, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-028', 'Digital Signal Processing', 0, 'Major', NULL, 5, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-029', 'Organizational Behavior', 0, 'Major', NULL, 5, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-030', 'Robotics', 0, 'Major', NULL, 5, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-031', 'Technical Writing', 0, 'Major', NULL, 6, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-032', 'Electrical Workshop Practice', 0, 'Major', NULL, 6, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-033', 'Power Electronics', 0, 'Major', NULL, 6, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-034', 'Electronics Circuit Design', 0, 'Major', NULL, 6, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-035', 'Power Distribution and Utilization', 0, 'Major', NULL, 6, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-036', 'Linear Control Systems', 0, 'Major', NULL, 6, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-037', 'Electromagnetic Field Theory', 0, 'Major', NULL, 7, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-038', 'Computer Communication Networks', 0, 'Major', NULL, 7, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-039', 'Digital Signal Processing', 0, 'Major', NULL, 7, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-040', 'Embedded Systems', 0, 'Major', NULL, 7, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-041', 'Final Year Project-I', 0, 'Capstone Project', NULL, 7, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-042', 'Engineering Economics', 0, 'Major', NULL, 8, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-043', 'Power System Analysis and Protection', 0, 'Major', NULL, 8, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-044', 'Wireless & Mobile Communication', 0, 'Major', NULL, 8, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-045', 'Final Year Project-II', 0, 'Capstone Project', NULL, 8, 'Credit hours not printed in the prospectus - set before use.');
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='MS Electrical Engineering' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'MS Electrical Engineering', '2024-25', 'Prospectus 2024-25, Electrical Engineering department. Course list only - no CLOs/PLOs.', 'PUBLISHED', 'MS Electrical Engineering', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6401', 'Research Methodology', 3, 'Major', 'Core courses (choose 4)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6101', 'Advanced Control System', 3, 'Major', 'Core courses (choose 4)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6126', 'Advanced Power Electronics', 3, 'Major', 'Core courses (choose 4)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6301', 'Wireless Communication Techniques', 3, 'Major', 'Core courses (choose 4)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6402', 'Stochastic Processes', 3, 'Major', 'Core courses (choose 4)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6404', 'Optimization Techniques in Electrical Engineering', 3, 'Major', 'Core courses (choose 4)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6202', 'Microelectronic Devices', 3, 'Elective', 'Specialization: Electronics & Embedded Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6203', 'Microsystems Technology', 3, 'Elective', 'Specialization: Electronics & Embedded Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6204', 'Optoelectronic Devices', 3, 'Elective', 'Specialization: Electronics & Embedded Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6205', 'Nanotechnology', 3, 'Elective', 'Specialization: Electronics & Embedded Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6206', 'Microwave and Millimeter-wave Devices', 3, 'Elective', 'Specialization: Electronics & Embedded Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6207', 'Advanced Computer Architecture', 3, 'Elective', 'Specialization: Electronics & Embedded Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6208', 'Advanced VLSI Design', 3, 'Elective', 'Specialization: Electronics & Embedded Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6209', 'Photonic Devices & Circuits', 3, 'Elective', 'Specialization: Electronics & Embedded Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6210', 'MEMS and Micromachining', 3, 'Elective', 'Specialization: Electronics & Embedded Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6211', 'Advanced Microelectronic Technology', 3, 'Elective', 'Specialization: Electronics & Embedded Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6212', 'Advanced Semiconductor Devices', 3, 'Elective', 'Specialization: Electronics & Embedded Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6213', 'Modeling and Simulation of Semiconductor Devices', 3, 'Elective', 'Specialization: Electronics & Embedded Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6214', 'Photovoltaic Electronics', 3, 'Elective', 'Specialization: Electronics & Embedded Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6215', 'Power Semiconductor Devices', 3, 'Elective', 'Specialization: Electronics & Embedded Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6216', 'Photovoltaic Material System', 3, 'Elective', 'Specialization: Electronics & Embedded Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6217', 'Analytical Methods in Nano-scale Electronics', 3, 'Elective', 'Specialization: Electronics & Embedded Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6218', 'Advance Topics in Nanotechnology', 3, 'Elective', 'Specialization: Electronics & Embedded Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6219', 'Advance Power Electronics', 3, 'Elective', 'Specialization: Electronics & Embedded Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6220', 'Analog Integrated Electronics', 3, 'Elective', 'Specialization: Electronics & Embedded Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6330', 'Advanced Computer Networks', 3, 'Elective', 'Specialization: Electronics & Embedded Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6302', 'RF System Engineering and Design', 3, 'Elective', 'Specialization: Communication Systems & Networks', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6303', 'Antennas Theory, Design and Applications', 3, 'Elective', 'Specialization: Communication Systems & Networks', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6304', 'Radar Systems', 3, 'Elective', 'Specialization: Communication Systems & Networks', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6305', 'IoT Communication Devices and Protocols', 3, 'Elective', 'Specialization: Communication Systems & Networks', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6306', 'Satellite Communications', 3, 'Elective', 'Specialization: Communication Systems & Networks', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6307', 'Cognitive & Software Defined Radio', 3, 'Elective', 'Specialization: Communication Systems & Networks', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6308', 'Embedded System Design for Telecommunications', 3, 'Elective', 'Specialization: Communication Systems & Networks', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6309', 'Telecommunication Switching Systems', 3, 'Elective', 'Specialization: Communication Systems & Networks', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6310', 'Telecommunication Network Management', 3, 'Elective', 'Specialization: Communication Systems & Networks', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6311', 'Advanced Optical Fiber Networks', 3, 'Elective', 'Specialization: Communication Systems & Networks', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6312', 'Advanced Routing and Switching', 3, 'Elective', 'Specialization: Communication Systems & Networks', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6313', 'Advanced Internet Technologies', 3, 'Elective', 'Specialization: Communication Systems & Networks', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6314', 'Optimization Techniques', 3, 'Elective', 'Specialization: Communication Systems & Networks', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6315', 'Wireless Sensor Networks', 3, 'Elective', 'Specialization: Communication Systems & Networks', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6316', 'Advanced Network Design', 3, 'Elective', 'Specialization: Communication Systems & Networks', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6317', 'Mobile Computing', 3, 'Elective', 'Specialization: Communication Systems & Networks', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6318', 'Multimedia Networking', 3, 'Elective', 'Specialization: Communication Systems & Networks', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6319', 'Advanced Network Security', 3, 'Elective', 'Specialization: Communication Systems & Networks', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6320', 'Advanced Digital Image Processing', 3, 'Elective', 'Specialization: Communication Systems & Networks', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6321', 'Advanced Topics in Wireless & Networking', 3, 'Elective', 'Specialization: Communication Systems & Networks', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6322', 'Information Theory and Coding', 3, 'Elective', 'Specialization: Communication Systems & Networks', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6323', 'Advanced Digital Signal Processing', 3, 'Elective', 'Specialization: Communication Systems & Networks', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6324', 'Cognitive Cooperative Networks', 3, 'Elective', 'Specialization: Communication Systems & Networks', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6325', 'Radio & Microwave Engineering', 3, 'Elective', 'Specialization: Communication Systems & Networks', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6326', 'Advanced Electromagnetic Field Theory', 3, 'Elective', 'Specialization: Communication Systems & Networks', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6327', 'Advance Cellular & Mobile Communication', 3, 'Elective', 'Specialization: Communication Systems & Networks', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6328', 'Advance Digital Communication', 3, 'Elective', 'Specialization: Communication Systems & Networks', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6329', 'Advance Topics in Communication', 3, 'Elective', 'Specialization: Communication Systems & Networks', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6101-B', 'Power System Operation and Control', 3, 'Elective', 'Specialization: Power & Control Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6102', 'Power Systems Analysis', 3, 'Elective', 'Specialization: Power & Control Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6103', 'Power System Operation Control and Optimization', 3, 'Elective', 'Specialization: Power & Control Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6104', 'Robust Multivariable Control System', 3, 'Elective', 'Specialization: Power & Control Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6105', 'Dynamic Modeling System', 3, 'Elective', 'Specialization: Power & Control Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6106', 'Fuzzy Logic and Intelligent Control Systems', 3, 'Elective', 'Specialization: Power & Control Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6107', 'Nonlinear Control Systems', 3, 'Elective', 'Specialization: Power & Control Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6108', 'Adaptive Control Systems', 3, 'Elective', 'Specialization: Power & Control Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6109', 'Robotics and Intelligent Sensors', 3, 'Elective', 'Specialization: Power & Control Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6110', 'Advanced Interfacing Techniques', 3, 'Elective', 'Specialization: Power & Control Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6111', 'Mechatronics', 3, 'Elective', 'Specialization: Power & Control Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6112', 'Advanced Solid-State Devices', 3, 'Elective', 'Specialization: Power & Control Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6113', 'Industrial Automation Technologies', 3, 'Elective', 'Specialization: Power & Control Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6114', 'System Integration', 3, 'Elective', 'Specialization: Power & Control Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6115', 'Industrial Project Management', 3, 'Elective', 'Specialization: Power & Control Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6116', 'Control Instrumentation and Robotics', 3, 'Elective', 'Specialization: Power & Control Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6117', 'Process Control Commissioning and Production Management', 3, 'Elective', 'Specialization: Power & Control Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6118', 'Distributed and Autonomous Robotic Systems', 3, 'Elective', 'Specialization: Power & Control Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6119', 'Stochastic Control and Fault Diagnostics', 3, 'Elective', 'Specialization: Power & Control Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6120', 'Networked Control and Multiagent Systems', 3, 'Elective', 'Specialization: Power & Control Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6121', 'Artificial Intelligence for Control Engineering', 3, 'Elective', 'Specialization: Power & Control Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6122', 'Deep Learning', 3, 'Elective', 'Specialization: Power & Control Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6123', 'Robust and Optimal Control Systems', 3, 'Elective', 'Specialization: Power & Control Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6124', 'Computer Vision', 3, 'Elective', 'Specialization: Power & Control Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6126-B', 'Advance Power Electronics', 3, 'Elective', 'Specialization: Power & Control Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6127', 'Analog Integrated Electronics', 3, 'Elective', 'Specialization: Power & Control Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'EEE-6125', 'Artificial Intelligence in Electrical Power System', 3, 'Elective', 'Specialization: Power & Control Systems', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-001', 'Thesis', 6, 'Capstone Project', 'Thesis option', NULL, 'Min CGPA 3.0 required to opt for thesis; after 24 Cr coursework');
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='BBA' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'BBA', '2024-25', 'Prospectus 2024-25, Business Administration department. Course list only - no CLOs/PLOs.', 'PUBLISHED', 'BBA', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1200', 'Functional English', 3, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1100', 'Applications of Information and Communication Technologies', 3, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC1100', 'Principles of Management', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC1500', 'Principles of Marketing', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2603', 'Environmental Sciences', 3, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1201', 'Expository Writing', 3, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2713', 'Psychology', 2, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2800', 'Entrepreneurship', 2, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC1400', 'Principles of Accounting', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2400', 'Islamic Studies', 2, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1300', 'Quantitative Reasoning I', 3, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC2016', 'Business Communication and Report Writing', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC2907', 'Fundamentals of Data Science', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC2401', 'Financial Accounting', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1301', 'Quantitative Reasoning II', 3, 'General Education', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3203', 'Business Economics', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4510', 'Digital Marketing Management', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2401', 'Ideology and Constitution of Pakistan', 2, 'General Education', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC2402', 'Business Finance', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC2901', 'Management Information System', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1504', 'Sociology', 2, 'General Education', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2402', 'Civics and Community Engagement', 2, 'General Education', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3403', 'Management Accounting', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3007', 'Personal and Professional Development', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3103', 'Business and Company Law', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3600', 'Production and Operations Management', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3300', 'Human Resource Management', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4801', 'Critical Thinking and Logic', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3102', 'Organizational Behavior and Professional Ethics', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3008', 'Business Research Methods', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC2401-B', 'Financial Management', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4611', 'Procurement Management', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3700', 'Project Management', 3, 'Capstone Project', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3806', 'Startup Ecosystem & Ideation', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4106', 'Seminar in Business Studies', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4807', 'Innovation and Product Development', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4105', 'International Business', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-001', 'Internship', 3, 'Field Experience', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-002', 'Elective 1', 3, 'Elective', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-003', 'Elective 2', 3, 'Elective', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4104', 'Business Policy', 3, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4904', 'Business Analytics', 3, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4114', 'Business Sustainability and Circular Economy', 3, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-004', 'Elective 3', 3, 'Elective', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-005', 'Elective 4', 3, 'Elective', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-006', 'FYP', 3, 'Capstone Project', NULL, 8, NULL);
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='MBA (for Business Students)' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'MBA (for Business Students)', '2024-25', 'Prospectus 2024-25, Business Administration department. Course list only - no CLOs/PLOs.', 'PUBLISHED', 'MBA (for Business Students)', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC5000', 'Research Methodology', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC5400', 'Strategic Finance', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC5500', 'Strategic Marketing', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-001', 'Elective 1', 3, 'Elective', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC5200', 'Managerial Economics', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC5100', 'Strategic Management', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-002', 'Elective 2', 3, 'Elective', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-003', 'Elective 3', 3, 'Elective', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC6002/MSC6003', 'Project PG / Two Electives / MBA Thesis', 6, 'Capstone Project', NULL, 3, NULL);
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='MBA (for Non-Business Students)' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'MBA (for Non-Business Students)', '2024-25', 'Prospectus 2024-25, Business Administration department. Course list only - no CLOs/PLOs.', 'PUBLISHED', 'MBA (for Non-Business Students)', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4415', 'Accounting for Managers', 3, 'Major', 'Semester 1 (Deficiency)', 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4500', 'Marketing Theory and Practice', 3, 'Major', 'Semester 1 (Deficiency)', 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4122', 'Management Theory and Practice', 3, 'Major', 'Semester 1 (Deficiency)', 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4016', 'Business Communication and Report Writing', 3, 'Major', 'Semester 1 (Deficiency)', 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC5001', 'Quantitative Techniques', 3, 'Major', 'Semester 1 (Deficiency)', 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4203', 'Business Economics', 3, 'Major', 'Semester 2 (Deficiency)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4300', 'Human Resource Management', 3, 'Major', 'Semester 2 (Deficiency)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4700', 'Project Management', 3, 'Capstone Project', 'Semester 2 (Deficiency)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4901', 'Management Information System', 3, 'Major', 'Semester 2 (Deficiency)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4416', 'Finance for Managers', 3, 'Major', 'Semester 2 (Deficiency)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC5200', 'Managerial Economics', 3, 'Major', 'Summer Semester', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC5100', 'Strategic Management', 3, 'Major', 'Summer Semester', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC5000', 'Research Methodology', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC5400', 'Strategic Finance', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC5500', 'Strategic Marketing', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-001', 'Elective 1 / Specialization', 3, 'Elective', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-002', 'Elective 2', 3, 'Elective', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-003', 'Elective 3', 3, 'Elective', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-004', 'Thesis / Project / Two Elective Courses', 6, 'Capstone Project', NULL, 4, NULL);
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='MS Management Science (for Business Students)' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'MS Management Science (for Business Students)', '2024-25', 'Prospectus 2024-25, Business Administration department. Course list only - no CLOs/PLOs.', 'PUBLISHED', 'MS Management Science (for Business Students)', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC6107', 'Advanced Management', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC5000', 'Research Methodology', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-001', 'Elective 1', 3, 'Elective', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-002', 'Elective 2', 3, 'Elective', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC6004', 'Quantitative and Qualitative Methods', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-003', 'Elective 3', 3, 'Elective', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-004', 'Elective 4', 3, 'Elective', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-005', 'Elective 5', 3, 'Elective', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-006', 'MS Thesis / Two Elective Courses', 6, 'Capstone Project', NULL, 3, NULL);
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='MS Management Science (for Non-Business Students)' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'MS Management Science (for Non-Business Students)', '2024-25', 'Prospectus 2024-25, Business Administration department. Course list only - no CLOs/PLOs.', 'PUBLISHED', 'MS Management Science (for Non-Business Students)', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4415', 'Accounting for Managers', 3, 'Major', 'Semester 1 (Deficiency)', 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4500', 'Marketing Theory and Practice', 3, 'Major', 'Semester 1 (Deficiency)', 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4122', 'Management Theory and Practice', 3, 'Major', 'Semester 1 (Deficiency)', 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4016', 'Business Communication and Report Writing', 3, 'Major', 'Semester 1 (Deficiency)', 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC5001', 'Quantitative Techniques', 3, 'Major', 'Semester 1 (Deficiency)', 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4203', 'Business Economics', 3, 'Major', 'Semester 2 (Deficiency)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4300', 'Human Resource Management', 3, 'Major', 'Semester 2 (Deficiency)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4700', 'Project Management', 3, 'Capstone Project', 'Semester 2 (Deficiency)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4901', 'Management Information System', 3, 'Major', 'Semester 2 (Deficiency)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4416', 'Finance for Managers', 3, 'Major', 'Semester 2 (Deficiency)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC6107', 'Advanced Management', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC5000', 'Research Methodology', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-001', 'Elective 1', 3, 'Elective', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-002', 'Elective 2', 3, 'Elective', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC5400', 'Strategic Finance', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC5500', 'Strategic Marketing', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-003', 'Elective 3', 3, 'Elective', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-004', 'Elective 4', 3, 'Elective', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-005', 'MS Thesis / Two Elective Courses', 6, 'Capstone Project', NULL, 5, NULL);
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='PhD Management Science' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'PhD Management Science', '2024-25', 'Prospectus 2024-25, Business Administration department. Course list only - no CLOs/PLOs.', 'PUBLISHED', 'PhD Management Science', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-001', 'Mandatory Courses', 6, 'Major', 'Coursework', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-002', 'Elective Courses', 12, 'Elective', 'Coursework', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-003', 'Thesis', 18, 'Capstone Project', 'Research', NULL, 'Complete coursework; pass Qualifying Exam (DQE) & proposal defense; CGPA ≥ 3.5');
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='BS Accounting & Finance' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'BS Accounting & Finance', '2024-25', 'Prospectus 2024-25, Economics and Finance department. Course list only - no CLOs/PLOs.', 'PUBLISHED', 'BS Accounting & Finance', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1200', 'Functional English', 3, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1100', 'Applications of Information and Communication Technology', 3, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC1100', 'Principles of Management', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC1500', 'Principles of Marketing', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2603', 'Environmental Sciences', 3, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1201', 'Expository Writing', 3, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2713', 'Psychology', 2, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1300', 'Quantitative Reasoning I', 3, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC1400', 'Principles of Accounting', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2400', 'Islamic Studies', 2, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2800', 'Entrepreneurship', 2, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC2016', 'Business Communication and Report Writing', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC2907', 'Fundamentals of Data Science', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC2401', 'Financial Accounting', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1301', 'Quantitative Reasoning II', 3, 'General Education', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC2405', 'Business Taxation', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC2402', 'Business Finance', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2402', 'Ideology and Constitution of Pakistan', 2, 'General Education', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC2213', 'Business Economics', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC2901', 'Management Information System', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1504', 'Sociology', 2, 'General Education', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2402-B', 'Community Service and Social Work', 2, 'General Education', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3403', 'Management Accounting', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3007', 'Personal and Professional Development', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3103', 'Business and Company Law', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3408', 'Corporate Governance', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3300', 'Human Resource Management', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3801', 'Critical Thinking and Logic', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3410', 'Auditing & Assurance', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3008', 'Business Research Methods', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3404', 'Financial Management', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3442', 'Advanced Management Accounting', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3429', 'Financial Reporting', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3407', 'Financial Markets and Institutions', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4423', 'Financial Econometrics', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4428', 'Advance Financial Accounting', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4438', 'Financial Risk Management', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-001', 'Elective 1', 3, 'Elective', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-002', 'Elective 2', 3, 'Elective', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4006', 'Internship', 3, 'Field Experience', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4418', 'Financial Modeling', 3, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4416', 'International Finance', 3, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4942', 'Financial Technology', 3, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-003', 'Elective 3', 3, 'Elective', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-004', 'Elective 4', 3, 'Elective', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4015', 'FYP', 3, 'Capstone Project', NULL, 8, NULL);
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='BS Aviation Management' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'BS Aviation Management', '2024-25', 'Prospectus 2024-25, Technology & Innovation department. Course list only - no CLOs/PLOs.', 'PUBLISHED', 'BS Aviation Management', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-001', 'History of Flight', 0, 'Major', NULL, 1, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-002', 'ICAO Aviation English', 0, 'Major', NULL, 1, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-003', 'Application of Information & Communication Technology', 0, 'Major', NULL, 1, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-004', 'Applied Physics', 0, 'Major', NULL, 1, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-005', 'Principles of Management', 0, 'Major', NULL, 1, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-006', 'Functional English', 0, 'Major', NULL, 1, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-007', 'Navigation & Flight Planning', 0, 'Major', NULL, 2, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-008', 'Meteorology', 0, 'Major', NULL, 2, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-009', 'Quantitative Reasoning – I', 0, 'Major', NULL, 2, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-010', 'Expository Writing', 0, 'Major', NULL, 2, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-011', 'Islamic Studies / Social Ethics', 0, 'Major', NULL, 2, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-012', 'Principles of Marketing', 0, 'Major', NULL, 2, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-013', 'Aero-Engines', 0, 'Major', NULL, 3, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-014', 'Professional Ethics', 0, 'Major', NULL, 3, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-015', 'Organizational Behavior', 0, 'Major', NULL, 3, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-016', 'Aircraft Communication', 0, 'Major', NULL, 3, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-017', 'Ideology & Constitution of Pakistan', 0, 'Major', NULL, 3, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-018', 'Civics and Community Engagement', 0, 'Major', NULL, 3, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-019', 'Entrepreneurship', 0, 'Major', NULL, 3, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-020', 'Safety Management System in Aviation', 0, 'Major', NULL, 4, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-021', 'Aircraft General Knowledge', 0, 'Major', NULL, 4, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-022', 'Aircraft Accident Investigation', 0, 'Major', NULL, 4, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-023', 'Management Information System', 0, 'Major', NULL, 4, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-024', 'Quantitative Reasoning – II', 0, 'Major', NULL, 4, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-025', 'Psychology', 0, 'Major', NULL, 4, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-026', 'Essentials of Aviation Management', 0, 'Major', NULL, 5, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-027', 'Airport Planning & Designing', 0, 'Major', NULL, 5, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-028', 'Health and Safety Environment in Aviation', 0, 'Major', NULL, 5, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-029', 'Logistic Management', 0, 'Major', NULL, 5, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-030', 'Micro Economics', 0, 'Major', NULL, 5, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-031', 'Human Resource Management in Aviation', 0, 'Major', NULL, 5, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-032', 'Airspace Management in Pakistan', 0, 'Major', NULL, 6, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-033', 'Business and Corporate Aviation', 0, 'Major', NULL, 6, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-034', 'Leadership and Management Skills', 0, 'Major', NULL, 6, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-035', 'Research Methodology', 0, 'Major', NULL, 6, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-036', 'Financial Accounting', 0, 'Major', NULL, 6, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-037', 'Managing Airline', 0, 'Major', NULL, 7, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-038', 'Aviation Project Management', 0, 'Major', NULL, 7, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-039', 'Total Quality Management', 0, 'Major', NULL, 7, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-040', 'Fundamentals of Artificial Intelligence', 0, 'Major', NULL, 7, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-041', 'Macro Economics', 0, 'Major', NULL, 7, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-042', 'Human Factors & Performance in Aviation', 0, 'Major', NULL, 8, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-043', 'Airline and Airport Economics', 0, 'Major', NULL, 8, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-044', 'Operation Management', 0, 'Major', NULL, 8, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-045', 'Internship Report', 0, 'Field Experience', NULL, 8, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-046', 'Capstone Project', 0, 'Major', NULL, 8, 'Credit hours not printed in the prospectus - set before use.');
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='BS Tourism & Hospitality' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'BS Tourism & Hospitality', '2024-25', 'Prospectus 2024-25, Tourism & Hospitality department. Course list only - no CLOs/PLOs.', 'PUBLISHED', 'BS Tourism & Hospitality', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG1001', 'English I', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'HUM1002', 'Pakistan Studies', 2, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC1000', 'Business Math', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC1100', 'Principles of Management', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'TNH1000', 'Cultural History of Pakistan', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'TNH1100', 'Introduction to Tourism & Hospitality', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG1002', 'English II', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC1900', 'Introduction to Computer Applications', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'TNH1001', 'Introduction to Archaeology', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY2101', 'Psychology', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'HUM1001', 'Islamic Studies', 2, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'TNH1101', 'Pakistan-Tourism Destinations', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC2001', 'Oral Communication', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'TNH2102', 'Tourism: Concepts & Principles', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'SOC2101', 'Sociology', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4504', 'Consumer Behavior', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'TNH2102-B', 'Cultural Tourism', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC2002', 'Introduction to Statistics', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'TNH2104', 'Hospitality Operations', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC2200', 'Principles of Microeconomics', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'TNH2105', 'House Keeping Operations and Management', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'TNH2106', 'Event Management', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'TNH2107', 'Culinary Art', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'TNH3108', 'Tourism Management', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'TNH3109', 'Tourism and Hospitality Laws', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'TNH3200', 'Front Office Operations and Management', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'TNH3201', 'Travel and Tour Operations', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'TNH3202', 'Tourism Marketing', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3008', 'Research Methods', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3700', 'Project Management', 3, 'Capstone Project', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'TNH3203', 'Religious Tourism', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'TNH3204', 'Sport and Adventure Tourism', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'TNH3205', 'Heritage Management', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'TNH4206', 'Restaurant Management', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'TNH4207', 'Hotel and Restaurant Accounting', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'TNH4300', 'Tourism Planning and Development', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'TNH4208', 'Sustainable Tourism', 0, 'Major', NULL, 7, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'TNH4209', 'Food & Beverages Management', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4009', 'Project PG', 3, 'Capstone Project', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'TNH4210', 'Seminar in Tourism & Hospitality', 3, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'TNH4211', 'Emerging Trends in Tourism and Hospitality', 3, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'TNH4301', 'Tourism Risk and Disaster Management', 3, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'TNH4302', 'Destination Branding', 3, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'TNH4303', 'Global Tourism', 3, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-001', 'Internship (4–6 weeks, mandatory)', 2, 'Field Experience', 'Summer (Year 2 or 3)', NULL, NULL);
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='BS Psychology' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'BS Psychology', '2024-25', 'Prospectus 2024-25, Psychology department. Course list only - no CLOs/PLOs.', 'PUBLISHED', 'BS Psychology', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1200', 'Functional English (G)', 3, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1300', 'Quantitative Reasoning-I (G)', 3, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2601', 'Biology (G) (Natural Sciences)', 3, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY1201', 'Schools & Perspectives in Psychology (D)', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2401', 'Ideology & Constitution of Pakistan (G)', 2, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1503', 'Fundamentals of Psychology (G) (Social Sciences)', 2, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1201', 'Expository Writing (G)', 3, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1100', 'Applications of Information & Communication Technology (G)', 3, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1301', 'Quantitative Reasoning-II (G)', 3, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY1202', 'Applied Areas of Psychology (D)', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY1203', 'Theories of Personality (D)', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2400', 'Islamic Studies (G)', 2, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2714', 'Fundamentals of Sociology (G) (Arts & Humanities)', 2, 'General Education', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY2204', 'Abnormal Psychology (D)', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY2205', 'Cognitive Psychology (D)', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY2301', 'Organizational Psychology (I)', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY2206', 'Health Psychology (D)', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2800', 'Entrepreneurship (G)', 2, 'General Education', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY2207', 'Social Psychology (D)', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY2208', 'Ethical Issues in Psychology (D)', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY2209', 'Experimental Psychology + Lab Experiments (D)', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY2210', 'Positive Psychology (D)', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY2211', 'Fundamental Research Methods in Psychology (D)', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER-2402', 'Civics & Community Engagement (G)', 2, 'General Education', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY3212', 'Psychological Assessment + Practical (D)', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY3213', 'Advanced Research Methods in Psychology (D)', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY3214', 'Statistics in Psychology (D)', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY3215', 'Developmental Psychology (D)', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY3216', 'Psychopathology-I (D)', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY3302', 'Personal and Professional Development (I)', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY3217', 'Psychopathology-II (D)', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY3303', 'Environmental Psychology (I)', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY3218', 'Neurological Basis of Behavior (D)', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY3304', 'Human Resource Management (I)', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY3219', 'Data Analysis using SPSS (D)', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY3401', 'Teaching & Learning Skills (M)', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY4220', 'Gender Psychology (D)', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY4221', 'Clinical Psychology-I (D)', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY4222', 'Guidance and Counseling (D)', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY4501', 'Clinical Case Studies', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY4402', 'Educational Technology (M)', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY4223', 'Forensic Psychology (D)', 3, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY4224', 'Clinical Psychology-II (D)', 3, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY5601', 'Research Thesis', 3, 'Capstone Project', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY4403', 'Educational Psychology (M)', 3, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY4404', 'Education for Students with Special Needs (M)', 3, 'Major', NULL, 8, NULL);
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='MS Clinical Psychology' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'MS Clinical Psychology', '2024-25', 'Prospectus 2024-25, Psychology department. Course list only - no CLOs/PLOs.', 'PUBLISHED', 'MS Clinical Psychology', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY6008', 'Guidance & Counseling', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY6009', 'Psycho-diagnosis and Psychopathology', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY6010', 'Psychotherapy-I', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY6011', 'Psychophysiology and Psychopharmacology', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY6205', 'Research Design & Practices', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY6702', 'Psychometrics and Clinical Assessment', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY6012', 'Psychotherapy-II', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY6803', 'Advance Data Analysis Techniques', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY7013', 'Clinical Practicum & Report Writing', 4, 'Major', 'Semester 3 & 4', 3, '560 clinical hours completed in 3rd semester');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY7206', 'Thesis / Two Elective Courses (3 Cr each)', 6, 'Capstone Project', 'Semester 3 & 4', 3, 'CGPA below 3.0 → two elective courses instead of thesis');
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='PhD Psychology' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'PhD Psychology', '2024-25', 'Prospectus 2024-25, Psychology department. Course list only - no CLOs/PLOs.', 'PUBLISHED', 'PhD Psychology', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY8018', 'Clinical Psychology and its Application', 3, 'Major', 'Semester 1 (choose 3 × 3 Cr)', 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY8209', 'Advance Research Methods', 3, 'Major', 'Semester 1 (choose 3 × 3 Cr)', 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY8805', 'Data Analysis using SPSS/AMOS/Mplus/Nvivo', 3, 'Major', 'Semester 1 (choose 3 × 3 Cr)', 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY8019', 'Emerging Trends in Counseling Psychology', 3, 'Major', 'Semester 1 (choose 3 × 3 Cr)', 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY8504', 'Psychology of Life Span Development', 3, 'Major', 'Semester 1 (choose 3 × 3 Cr)', 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY8127', 'Psychology of Attitude and Opinion', 3, 'Major', 'Semester 1 (choose 3 × 3 Cr)', 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY8128', 'Emerging Trends in Gender Psychology', 3, 'Major', 'Semester 1 (choose 3 × 3 Cr)', 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY8129', 'Cross Cultural Psychology', 3, 'Major', 'Semester 1 (choose 3 × 3 Cr)', 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY8130', 'Theories in Cognitive Psychology', 3, 'Major', 'Semester 1 (choose 3 × 3 Cr)', 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY8131', 'Criminal and Forensic Psychology', 3, 'Major', 'Semester 1 (choose 3 × 3 Cr)', 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY8403', 'Occupational Health Psychology', 3, 'Major', 'Semester 1 (choose 3 × 3 Cr)', 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY8210', 'Critical Review of Published Research', 3, 'Major', 'Semester 2 (choose 3 × 3 Cr)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY8603', 'Ethical & Legal Considerations in Psychology', 3, 'Major', 'Semester 2 (choose 3 × 3 Cr)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY8132', 'Advanced Seminars in Theories of Psychology', 3, 'Major', 'Semester 2 (choose 3 × 3 Cr)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY8704', 'Psychometrics', 3, 'Major', 'Semester 2 (choose 3 × 3 Cr)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY8133', 'Social Psychology and its Application', 3, 'Major', 'Semester 2 (choose 3 × 3 Cr)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY8303', 'Psychology of Self', 3, 'Major', 'Semester 2 (choose 3 × 3 Cr)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY8134', 'Applications in Positive Psychology', 3, 'Major', 'Semester 2 (choose 3 × 3 Cr)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY8135', 'Community Psychology', 3, 'Major', 'Semester 2 (choose 3 × 3 Cr)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY8020', 'Psychology of Special Education', 3, 'Major', 'Semester 2 (choose 3 × 3 Cr)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY8136', 'Rehabilitation Psychology', 3, 'Major', 'Semester 2 (choose 3 × 3 Cr)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY8137', 'Challenges in Environmental Psychology', 3, 'Major', 'Semester 2 (choose 3 × 3 Cr)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY8021', 'Disaster and Trauma Management', 3, 'Major', 'Semester 2 (choose 3 × 3 Cr)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY8138', 'Peace Psychology', 3, 'Major', 'Semester 2 (choose 3 × 3 Cr)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY8139', 'Family Psychology', 3, 'Major', 'Semester 2 (choose 3 × 3 Cr)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY9211', 'Dissertation', 18, 'Capstone Project', 'Research', NULL, 'Completion of 18 Cr coursework');
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='BS Media & Communication' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'BS Media & Communication', '2024-25', 'Prospectus 2024-25, Arts and Media department. Course list only - no CLOs/PLOs.', 'PUBLISHED', 'BS Media & Communication', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1200', 'Functional English*', 3, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC1101', 'Introduction to Mass Communication', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC1401', 'Photography', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC1501', 'Media and Popular Culture', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1100', 'Application of Information and Communication Technology*', 3, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-001', 'Natural Science** (from Gen. Ed. list)', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1201', 'Expository Writing*', 3, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC1302', 'Print Media', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2400', 'Islamic Studies*', 2, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC1301', 'Urdu for Journalism', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC1102', 'Mass Media Development', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1300', 'Quantitative Reasoning I** (from Gen. Ed. list)', 3, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2401', 'Ideology and Constitution of Pakistan*', 2, 'General Education', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC2402', 'Computer Graphics', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC2601', 'Media Ethics & Laws', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-002', 'Gen. Ed. Social Sciences**', 2, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC2205', 'Conflict, Crisis and Communication', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1301', 'Quantitative Reasoning II** (from Gen. Ed. list)', 3, 'General Education', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC2504', 'Broadcast Journalism', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC2505', 'Online Journalism', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC2303', 'Reporting and News Writing', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-003', 'Gen. Ed. Arts & Humanities**', 2, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2800', 'Entrepreneurship*', 2, 'General Education', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC2701', 'Video Production', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2402', 'Civics & Community Engagement*', 2, 'General Education', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CPJ5101', 'Internship', 3, 'Field Experience', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-004', 'Interdisciplinary Course 1', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC3602', 'Research Methods in Communication-I', 0, 'Major', NULL, 5, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC3603', 'Theories of Communication-I', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC3506', 'Organizational Communication', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-005', 'Interdisciplinary Course 2', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC3502', 'Advertising & Public Relation', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC3403', 'Sub Editing & Page Designing (Theory & Practical)', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC3604', 'Theories of Communication-II', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-006', 'Interdisciplinary Course 3', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC3605', 'Research Methods in Communication-II', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-007', 'Minor Course 1', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-008', 'Minor Course 2', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC4204', 'Political Communication', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC4901', 'Script Writing and Storyboarding', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-009', 'Interdisciplinary Course 4', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC4609', 'International Communication', 3, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-010', 'Minor Course 3', 3, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC4608', 'Media Management & Marketing', 3, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-011', 'Minor Course 4', 3, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-012', 'Capstone Project', 3, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC4606', 'Documentary Production', 3, 'Elective', 'Minor Option 1 (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC4506', 'Editing Techniques', 3, 'Elective', 'Minor Option 1 (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC4502', 'TV Anchoring Techniques', 3, 'Elective', 'Minor Option 1 (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC4609-B', 'Digital Story Telling', 3, 'Elective', 'Minor Option 1 (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC4705', 'Radio Production', 3, 'Elective', 'Minor Option 1 (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC4706', 'Live and Outdoor Reporting', 3, 'Elective', 'Minor Option 1 (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC4807', 'Mobile Journalism (MOJO)', 3, 'Elective', 'Minor Option 1 (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC4505', 'Digital Photography and Photo Manipulation', 3, 'Elective', 'Minor Option 1 (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC4707', 'Contemporary Issues in Digital Journalism', 3, 'Elective', 'Minor Option 2 (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC4505-B', 'Digital Photography and Photo Manipulation', 3, 'Elective', 'Minor Option 2 (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC4801', 'Film Studies', 3, 'Elective', 'Minor Option 2 (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC4803', 'Program Production and Development', 3, 'Elective', 'Minor Option 2 (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC4804', 'Drama, Film and Theatre', 3, 'Elective', 'Minor Option 2 (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC4805', 'Digital Audio Video Tools', 3, 'Elective', 'Minor Option 2 (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC4806', 'Directing for Camera', 3, 'Elective', 'Minor Option 2 (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC4708', 'Advanced Cinematography', 3, 'Elective', 'Minor Option 2 (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC4901-B', 'Basic Design', 3, 'Elective', 'Minor Option 3 (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC4902', 'Graphic Design', 3, 'Elective', 'Minor Option 3 (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC4903', 'Communication Design', 3, 'Elective', 'Minor Option 3 (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC4904', 'Digital Illustration', 3, 'Elective', 'Minor Option 3 (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC4905', 'Typography', 3, 'Elective', 'Minor Option 3 (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC4906', 'Campaign Development', 3, 'Elective', 'Minor Option 3 (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MEC4907', 'User Interface Design', 3, 'Elective', 'Minor Option 3 (choose 12 Cr)', NULL, NULL);
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='Bachelor in Computer Arts (BCA)' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'Bachelor in Computer Arts (BCA)', '2024-25', 'Prospectus 2024-25, Arts and Media department. Course list only - no CLOs/PLOs.', 'PUBLISHED', 'Bachelor in Computer Arts (BCA)', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1200', 'Functional English*', 3, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA1101', 'Basic Drawing', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-001', 'Gen. Ed. Natural Science**', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA1102', 'Basic Design', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER-1100', 'Application of Information and Communication Technologies*', 3, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA1103', 'Drafting', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA1104', 'Still Life Drawing', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1201', 'Expository Writing*', 3, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2400', 'Islamic Studies*', 2, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA1201', 'History of Art in Ancient Civilizations', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA1401', 'Graphics Design', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1300', 'Gen. Ed. Quantitative Reasoning-I**', 3, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA2105', 'Landscape Drawing', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA2202', 'History of Western Arts', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA2301', 'Computer Graphics', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2401', 'Ideology and Constitution of Pakistan*', 2, 'General Education', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-002', 'Gen. Ed. Social Sciences**', 2, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1301', 'Gen. Ed. Quantitative Reasoning-II**', 3, 'General Education', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CM2701', 'Fundamentals of Photography', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-003', 'Gen. Ed. Arts and Humanities**', 2, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2800', 'Entrepreneurship*', 2, 'General Education', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA2501', 'Basic Animation', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA2501-B', 'Video Production', 0, 'Major', NULL, 4, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA2501-C', 'Communication Design', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2402', 'Civics and Community Engagement*', 2, 'General Education', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA3602', 'Intro Web Design', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA2501-D', 'Digital Illustration', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA3403', 'Typography', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA3702', 'Digital Photography', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'INT3101', 'Internship', 3, 'Field Experience', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-004', 'Minor Course 1', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA3106', 'Portrait Drawing', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA3603', 'Video Compositing', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA3802', 'Research Methodology', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA3602-B', 'Idea Development and Script Writing', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-005', 'Minor Course 2', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA4108', 'Anatomy Drawing', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-006', 'Interdisciplinary Course 1', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA4605', 'Compositing and Effects', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-007', 'Interdisciplinary Course 2', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-008', 'Minor Course 3', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA4203', 'Capstone Project', 3, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA4203-B', 'Ethics for Professional Practice', 3, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-009', 'Interdisciplinary Course 3', 3, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-010', 'Interdisciplinary Course 4', 3, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-011', 'Minor Course 4', 3, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA3404', 'Campaign Development', 3, 'Elective', 'Minor Option 1: Visual Communication (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA3405', 'Branding Techniques', 3, 'Elective', 'Minor Option 1: Visual Communication (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA4406', 'User Interface Design', 3, 'Elective', 'Minor Option 1: Visual Communication (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA4407', 'Desktop Publishing', 3, 'Elective', 'Minor Option 1: Visual Communication (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA4408', 'Advanced Campaign Development', 3, 'Elective', 'Minor Option 1: Visual Communication (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA3502', 'Introduction to 3D Modeling', 3, 'Elective', 'Minor Option 2: Digital Motion (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA3503', 'Stop Motion Animation', 3, 'Elective', 'Minor Option 2: Digital Motion (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA4504', 'Texturing and Lighting Techniques in 3D', 3, 'Elective', 'Minor Option 2: Digital Motion (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA4505', 'Character Design and Animation', 3, 'Elective', 'Minor Option 2: Digital Motion (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA4506', 'Animation and Production Techniques in 3D', 3, 'Elective', 'Minor Option 2: Digital Motion (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA4508', 'Digital Animation in 2D', 3, 'Elective', 'Minor Option 2: Digital Motion (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA3507', 'Character Design in 2D', 3, 'Elective', 'Minor Option 2: Digital Motion (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA3604', 'Scenography', 3, 'Elective', 'Minor Option 3: Video Production (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA3605', 'Advance Cinematography', 3, 'Elective', 'Minor Option 3: Video Production (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA4304', 'Digital Audio Tools', 3, 'Elective', 'Minor Option 3: Video Production (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA4609', 'Drama and Theatre', 3, 'Elective', 'Minor Option 3: Video Production (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA4606', 'Post-production Effects', 3, 'Elective', 'Minor Option 3: Video Production (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA3605-B', 'Light & Camera Techniques in Video Production', 3, 'Elective', 'Minor Option 3: Video Production (choose 12 Cr)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'CMA3607', 'TV & Film Direction', 3, 'Elective', 'Minor Option 3: Video Production (choose 12 Cr)', NULL, NULL);
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='MS Media Science' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'MS Media Science', '2024-25', 'Prospectus 2024-25, Arts and Media department. Course list only - no CLOs/PLOs.', 'PUBLISHED', 'MS Media Science', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MDS6011', 'Approaches to Mass Communication Studies – I (Compulsory)', 0, 'Major', NULL, 1, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MDS6021', 'Communication Research Methods – I (Compulsory)', 0, 'Major', NULL, 1, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-001', 'Elective Courses 3 & 4 (from list)', 0, 'Elective', NULL, 1, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MDS6012', 'Approaches to Mass Communication Studies – II (Compulsory)', 0, 'Major', NULL, 2, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MDS6022', 'Communication Research Methods – II (Compulsory)', 0, 'Major', NULL, 2, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'NC-002', 'Elective Courses 3 & 4 (from list)', 0, 'Elective', NULL, 2, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MDS7011', 'Research Track (Thesis)', 6, 'Capstone Project', 'Semester 3 & 4', 3, 'Coursework route: take two elective courses in semester 3 instead');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSS6014', 'Mass Media, Culture & Society', 0, 'Elective', 'Electives – Media Sciences', NULL, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSS6031', 'Philosophy of Social Sciences', 0, 'Elective', 'Electives – Media Sciences', NULL, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSS6015', 'Advanced Development Communication', 0, 'Elective', 'Electives – Media Sciences', NULL, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSS6032', 'Pakistan Media Prospects & Challenges', 0, 'Elective', 'Electives – Media Sciences', NULL, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSS6033', 'Media Debates', 0, 'Elective', 'Electives – Media Sciences', NULL, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSS6034', 'International Communication', 0, 'Elective', 'Electives – Media Sciences', NULL, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSS6035', 'Media and Politics', 0, 'Elective', 'Electives – Media Sciences', NULL, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSS6036', 'Media Sociology', 0, 'Elective', 'Electives – Media Sciences', NULL, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSS6037', 'Conflict and Crisis Communication', 0, 'Elective', 'Electives – Media Sciences', NULL, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSS6041', 'Framing, Reframing and Un-framing Cinema', 0, 'Elective', 'Electives – Production', NULL, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSS6042', 'Cinematography', 0, 'Elective', 'Electives – Production', NULL, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSS6043', 'Media Production', 0, 'Elective', 'Electives – Production', NULL, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSS6044', 'Editing Techniques', 0, 'Elective', 'Electives – Production', NULL, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSS6051', 'Design Information, Technology and Entrepreneurship', 0, 'Elective', 'Electives – Communication Design', NULL, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSS6052', 'Digital Media', 0, 'Elective', 'Electives – Communication Design', NULL, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSS6053', 'User Interface Design', 0, 'Elective', 'Electives – Communication Design', NULL, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSS6054', 'Visual Literacy & Visual Ethics', 0, 'Elective', 'Electives – Communication Design', NULL, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSS6061', 'Media Management and Marketing', 0, 'Elective', 'Electives – Media Management', NULL, 'Credit hours not printed in the prospectus - set before use.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSS6062', 'Media Managerial Communication', 0, 'Elective', 'Electives – Media Management', NULL, 'Credit hours not printed in the prospectus - set before use.');
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='BS English (Language & Literature)' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'BS English (Language & Literature)', '2024-25', 'Prospectus 2024-25, English department. Course list only - no CLOs/PLOs.', 'PUBLISHED', 'BS English (Language & Literature)', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2700', 'Professional Practices', 2, 'General Education', 'Gen. Ed. – Arts & Humanities (choose 1)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2701', 'Fundamentals of Fine Arts', 2, 'General Education', 'Gen. Ed. – Arts & Humanities (choose 1)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2702', 'Anthropology', 2, 'General Education', 'Gen. Ed. – Arts & Humanities (choose 1)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2703', 'History', 2, 'General Education', 'Gen. Ed. – Arts & Humanities (choose 1)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2704', 'Archeology', 2, 'General Education', 'Gen. Ed. – Arts & Humanities (choose 1)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2705', 'Heritage Conservation', 2, 'General Education', 'Gen. Ed. – Arts & Humanities (choose 1)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2706', 'Philosophy', 2, 'General Education', 'Gen. Ed. – Arts & Humanities (choose 1)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2707', 'Performing Arts', 2, 'General Education', 'Gen. Ed. – Arts & Humanities (choose 1)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2708', 'Photography', 2, 'General Education', 'Gen. Ed. – Arts & Humanities (choose 1)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2709', 'History of Art and Design', 2, 'General Education', 'Gen. Ed. – Arts & Humanities (choose 1)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2710', 'Culture Studies', 2, 'General Education', 'Gen. Ed. – Arts & Humanities (choose 1)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2711', 'Language and Literature', 2, 'General Education', 'Gen. Ed. – Arts & Humanities (choose 1)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2712', 'Curatorial Studies', 2, 'General Education', 'Gen. Ed. – Arts & Humanities (choose 1)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2713', 'Psychology', 2, 'General Education', 'Gen. Ed. – Arts & Humanities (choose 1)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2714', 'Fundamentals of Sociology', 2, 'General Education', 'Gen. Ed. – Arts & Humanities (choose 1)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2715', 'Professional Ethics', 2, 'General Education', 'Gen. Ed. – Arts & Humanities (choose 1)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2600', 'Applied Physics', 3, 'General Education', 'Gen. Ed. – Natural Sciences (choose 1)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2601', 'Biology', 3, 'General Education', 'Gen. Ed. – Natural Sciences (choose 1)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2602', 'Fundamentals of Geography', 3, 'General Education', 'Gen. Ed. – Natural Sciences (choose 1)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2603', 'Environmental Sciences', 3, 'General Education', 'Gen. Ed. – Natural Sciences (choose 1)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2604', 'Differential Equations', 3, 'General Education', 'Gen. Ed. – Natural Sciences (choose 1)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2605', 'Multivariable Calculus', 3, 'General Education', 'Gen. Ed. – Natural Sciences (choose 1)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1500', 'Fundamentals of Management', 2, 'General Education', 'Gen. Ed. – Social Sciences (choose 1)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1501', 'Fundamentals of Mass Communication', 2, 'General Education', 'Gen. Ed. – Social Sciences (choose 1)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1502', 'Fundamentals of Philosophy', 2, 'General Education', 'Gen. Ed. – Social Sciences (choose 1)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1503', 'Fundamentals of Psychology', 2, 'General Education', 'Gen. Ed. – Social Sciences (choose 1)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1504', 'Sociology', 2, 'General Education', 'Gen. Ed. – Social Sciences (choose 1)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1200', 'Functional English', 3, 'General Education', 'Gen. Ed. – Functional English (required)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1201', 'Expository Writing', 3, 'General Education', 'Gen. Ed. – English Writing (choose 1)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1202', 'English Composition', 3, 'General Education', 'Gen. Ed. – English Writing (choose 1)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1203', 'Technical Report Writing', 3, 'General Education', 'Gen. Ed. – English Writing (choose 1)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1300', 'Quantitative Reasoning - I', 3, 'General Education', 'Gen. Ed. – Quantitative Reasoning (choose 2)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1301', 'Quantitative Reasoning - II', 3, 'General Education', 'Gen. Ed. – Quantitative Reasoning (choose 2)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1302', 'Linear Algebra', 3, 'General Education', 'Gen. Ed. – Quantitative Reasoning (choose 2)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1303', 'Discrete Structures', 3, 'General Education', 'Gen. Ed. – Quantitative Reasoning (choose 2)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1304', 'Calculus & Analytical Geometry', 3, 'General Education', 'Gen. Ed. – Quantitative Reasoning (choose 2)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1305', 'Probability & Statistics', 3, 'General Education', 'Gen. Ed. – Quantitative Reasoning (choose 2)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2400', 'Islamic Studies', 2, 'General Education', 'Gen. Ed. – Islamic Studies / Ethics (choose 1)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2403', 'Ethics and Tolerance (for non-Muslims)', 2, 'General Education', 'Gen. Ed. – Islamic Studies / Ethics (choose 1)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2401', 'Ideology and Constitution of Pakistan', 2, 'General Education', 'Gen. Ed. – Required', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1100', 'Applications of Information & Communication Technologies (ICT)', 3, 'General Education', 'Gen. Ed. – Required', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2402', 'Civics and Community Engagement', 2, 'General Education', 'Gen. Ed. – Required', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2800', 'Entrepreneurship', 2, 'General Education', 'Gen. Ed. – Required', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN1010', 'Intro to Linguistics', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN1120', 'Phonetics & Phonology', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN2210', 'Intro to Morphology and Syntax', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN2430', 'Intro to Semantics', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN3450', 'Intro to Pragmatics', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN3610', 'Intro to Sociolinguistics', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN3710', 'Intro to Psycholinguistics', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN4410', 'Intro to Discourse Analysis', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN4250', 'Advanced Syntax', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN4710', 'Intro to Corpus Linguistics', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN4810', 'Intro to Translation Studies', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN4490', 'Intro to Computational Linguistics', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN3690', 'Emerging Trends in Sociolinguistics', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN4720', 'Intro to Forensic Linguistics', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN4730', 'Intro to Clinical Linguistics', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN4440', 'Language and Gender', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN4540', 'Second Language Acquisition', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'RES4110', 'Introduction to Research Methodology', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT1101', 'History of English Literature I', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT2102', 'History of English Literature II', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT2210', 'Poetry', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT3510', 'Literary Criticism', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT3410', 'Novel I', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT3310', 'Drama I', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT3530', 'Literary Theory', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT3220', 'Poetry II', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT3320', 'Drama II', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT3610', 'Introduction to Stylistics', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT4420', 'Novel II', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT4710', 'American Literature', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT4730', 'World Literature in English', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT4950', 'Intro to Postmodern Literature', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT4810', 'Essays and Short Stories', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT4820', 'Short Story Writing', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN4070', 'History of English Language', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT4930', 'Intro to South Asian Literature', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT4750', 'African Literature', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT4770', 'Postcolonial Women''s Writing', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT4760', 'Pakistani Folk Literature', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT4520', 'Pakistani English', 3, 'Major', 'Major (Disciplinary) courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY3110', 'Educational Psychology', 3, 'Major', 'Interdisciplinary courses (choose 4)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY4035', 'Stress and Conflict Management', 3, 'Major', 'Interdisciplinary courses (choose 4)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'PSY2108', 'Social Psychology', 3, 'Major', 'Interdisciplinary courses (choose 4)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'COM3141', 'Business Communication', 3, 'Major', 'Interdisciplinary courses (choose 4)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MCO3305', 'Theories of Communication', 3, 'Major', 'Interdisciplinary courses (choose 4)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MCO3021', 'International Relations', 3, 'Major', 'Interdisciplinary courses (choose 4)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ELT4510', 'Teaching of English as Second/Foreign Language', 3, 'Elective', 'Minor 1 – English Language Teaching (choose 4)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ELT4590', 'ELT Practicum', 3, 'Elective', 'Minor 1 – English Language Teaching (choose 4)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ELT4530', 'Testing and Assessment', 3, 'Elective', 'Minor 1 – English Language Teaching (choose 4)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ELT4560', 'English for Specific Purposes', 3, 'Elective', 'Minor 1 – English Language Teaching (choose 4)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ELT4570', 'Computer Assisted Language Learning', 3, 'Elective', 'Minor 1 – English Language Teaching (choose 4)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ELT4580', 'Intro to Critical Pedagogy', 3, 'Elective', 'Minor 1 – English Language Teaching (choose 4)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ELT4540', 'Materials Development', 3, 'Elective', 'Minor 1 – English Language Teaching (choose 4)', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MCO3120', 'Language and Media', 3, 'Elective', 'Minor 2 – Media Communication', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MCO3130', 'Content / Journalistic Writing', 3, 'Elective', 'Minor 2 – Media Communication', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MCO4131', 'Digital Content Making', 3, 'Elective', 'Minor 2 – Media Communication', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MCO3103', 'Reporting and News Writing', 3, 'Elective', 'Minor 2 – Media Communication', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MCO4102', 'Mass Media Development', 3, 'Elective', 'Minor 2 – Media Communication', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'INT4060', 'Internship', 3, 'Field Experience', 'Semester 7 – Internship', 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'RES5090', 'Research Project', 3, 'Major', 'Semester 8 – Capstone', 8, NULL);
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='MS English (Literature)' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'MS English (Literature)', '2024-25', 'Prospectus 2024-25, English department. Course list only - no CLOs/PLOs.', 'PUBLISHED', 'MS English (Literature)', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT7091', 'Research Methods in Literature', 3, 'Major', 'Core courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT7061', 'Literary Criticism and Theory', 3, 'Major', 'Core courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT7045', 'CDA for Literary Studies', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT7064', 'Postcolonial Theory and Literature', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT7015', 'Modern & Contemporary Poetry', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT7025', 'Diaspora Literature', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT7011', '20th Century Short Fiction', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT7045-B', 'Contemporary Novel', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT7035', 'Advanced Stylistics', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT7057', '''Literature in Film'' Studies', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT7021', 'South Asian Literature', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT7067', 'Postmodern Criticism', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT7051', 'Globalization and Literature', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT7053', 'Literature and Environment', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT7054', 'Writing the City', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT7081', 'Women''s Writings', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT7017', 'Postmodern Fiction', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT7071', 'Transnational Poetry', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT7055', 'Digital World and Literature', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT7072', 'Introduction to Monster Studies', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT7073', 'Medical Fictions: From Romantic to Modern', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT7023', 'Chinese Fiction in English', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT7068', 'Magical Realism in English Literature', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT7095', 'Research Seminar', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT7063', 'Literary Hermeneutics', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT7069', 'Postmodernism and Beyond', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIT7099', 'Thesis', 6, 'Capstone Project', 'Research work', NULL, '24 Cr coursework with CGPA ≥ 3.0; approved synopsis (~5000 words)');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG7011', 'Academic and Research Writing', 0, 'Major', 'Research work', NULL, NULL);
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='MS English (Linguistics)' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'MS English (Linguistics)', '2024-25', 'Prospectus 2024-25, English department. Course list only - no CLOs/PLOs.', 'PUBLISHED', 'MS English (Linguistics)', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN7091', 'Research Methods in Linguistics', 3, 'Major', 'Core courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN7021', 'Theories of Linguistics', 3, 'Major', 'Core courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN7031', 'Applied Linguistics', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN7073', 'Issues in Syntax', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN7025', 'Multilingualism', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN7047', 'Language, Gender and Identity', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN7046', 'Language and Media', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN7044', 'Language, Power and Ideology', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN7042', 'Critical Discourse Analysis', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN7067', 'English for Specific Purposes', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN7066', 'Second Language Teaching', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN7068', 'Language Assessment', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN7075', 'Applied Grammar and Syntax', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN7041', 'Discourse Studies', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN7017', 'Translation Studies', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN7019', 'Latest Trends in Linguistics', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN7053', 'Corpus Linguistics', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN7035', 'Psycho-Neurolinguistics', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN7023', 'Anthropological Linguistics', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN7029', 'Systemic Functional Linguistics', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN7049', 'Genre Analysis', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN7095', 'Research Seminar', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN7070', 'Theories of Narrative', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN7058', 'Advanced Stylistics', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'LIN7099', 'Thesis', 6, 'Capstone Project', 'Research work', NULL, '24 Cr coursework with CGPA ≥ 3.0; approved synopsis (~5000 words)');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG7011', 'Academic and Research Writing', 0, 'Major', 'Research work', NULL, NULL);
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='PhD English (Linguistics)' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'PhD English (Linguistics)', '2024-25', 'Prospectus 2024-25, English department. Course list only - no CLOs/PLOs.', 'PUBLISHED', 'PhD English (Linguistics)', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8995', 'Advanced Seminar in Research', 3, 'Major', 'Core course', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8026', 'Phonological Theory and Optimality', 3, 'Elective', 'Elective courses', NULL, 'LIN 1011 English Phonology');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8007', 'Syntactic Theory and Minimalism', 3, 'Elective', 'Elective courses', NULL, 'LIN2021 Introduction to Morphology and Syntax');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8061', 'Methods of Corpus Linguistics', 3, 'Elective', 'Elective courses', NULL, 'LNX6053 Corpus Linguistics');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8063', 'Corpus Stylistics', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8004', 'Lexical Functional Grammar', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8054', 'Language Policy and Planning', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8001', 'Morphological Theories', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8031', 'Computational Linguistics', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8011', 'Conceptual Semantics', 3, 'Elective', 'Elective courses', NULL, 'LIN2043 Introduction to Semantics');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8015', 'Intercultural Pragmatics', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8034', 'Cognitive Linguistics', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8022', 'World Englishes', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8028', 'Dialectology', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8024', 'Trends in Anthropological Linguistics', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8017', 'Socio-media Linguistics', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8052', 'Language, Gender and Power', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8019', 'Advanced Sociolinguistics', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8037', 'Psycho-Neurolinguistics', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8405', 'Ecolinguistic Research', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8991', 'Research Seminar', 0, 'Major', 'Research', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG9999', 'Dissertation', 18, 'Capstone Project', 'Research', NULL, '18 Cr coursework with CGPA ≥ 3.0; pass comprehensive exam; synopsis approved by FUI BASAR');
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='PhD English (Literature)' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'PhD English (Literature)', '2024-25', 'Prospectus 2024-25, English department. Course list only - no CLOs/PLOs.', 'PUBLISHED', 'PhD English (Literature)', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8995', 'Advanced Seminar in Research', 3, 'Major', 'Core course', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8075', 'Current Issues in Literary Theory', 3, 'Elective', 'Elective courses', NULL, 'LIT3053 Literary Theory');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8071', 'Theories of Narrative and Narratology', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8103', 'Shakespearean Studies', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8101', 'Pakistani Literature in English', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8104', 'Latin American Literature', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8105', 'World Literature in English', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8106', 'Post WW II Women Writers in English', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8107', 'Cultural Translation', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8108', 'Trends in American Literature', 3, 'Elective', 'Elective courses', NULL, 'LIT4071 American Literature');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8109', 'Emerging Genres in Literature', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8401', 'Ecological Crisis and Literature', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8203', 'Detective Fiction', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8201', 'Science Fiction in the New Millennium', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8102', 'Diaspora Literature', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8100', 'Literature and Globalization', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8110', 'Gender and Queer Studies', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8301', 'Transnational Poetry', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8081', 'bell hooks on Blackness, Feminism and Love', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8111', 'Exile Literature', 3, 'Elective', 'Elective courses', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG8991', 'Research Seminar', 0, 'Major', 'Research', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ENG9999', 'Dissertation', 18, 'Capstone Project', 'Research', NULL, '18 Cr coursework with CGPA ≥ 3.0; pass comprehensive exam; synopsis approved by FUI BASAR');
  END IF;
END $$;
-- Punjab University BS Computer Science (affiliated colleges) master curriculum, Version 1.0.0, 01-12-2021.
-- Source: 'Curricula/Syllabi of BS Computer Science for Affiliated Colleges', University of the Punjab (QEC Fall 2021).
-- Semester plan, prerequisites, descriptions, textbooks and reference material. The source has no CLOs/PLOs/topic plans.
-- Safe to re-run: skipped if it already exists.

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='University of the Punjab' AND title='BS Computer Science (PU)' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "publicationDate", "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'University of the Punjab', 'BS Computer Science (PU)', '1.0.0', '2021-12-01', 'Curricula/Syllabi of BS Computer Science for Punjab University Affiliated Colleges, v1.0.0, 01-12-2021. 8 semesters, 131 credit hours. No CLOs/PLOs in source.', 'PUBLISHED', 'BS Computer Science', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'GE-161', 'Introduction to ICT', 2, 'General Education', 'General Education', 1, 'Deborah Morley and Charles S. Parker, Understanding Computers: Today and Tomorrow, 16th edition, Cengage Learning, 2016, ISBN-13: 978-1337251853', 'Computers: Importance and History of Computers. Types of Computers. Computer Elements, Processor, Memory, Hardware, Software. Application Software its Uses and Limitations: Word Processing, Spreadsheet, Database Management System, etc. System Software its Importance: MS-DOS, Windows, and Linux. Computer-Based Information System (CBIS): Methods of Input, Storage and Processing, Terminal (Dump, Smart, Intelligent), Data Storage Units, RAID and Backup System, Dedicated Data Entry, SDA (Source Data Automation). Organizing Computer Facility, Centralized Computing Facility, Distributed Computing Facility. Data Communications: Data Communication Model, Data Transmission, Digital and Analog Transmission, Modems, Asynchronous, and Synchronous Transmission, Simplex. Half Duplex, Full Duplex Transmission, Communication Medias (Cables, Wireless), Protocols, Network Topologies (Star, Bus, Ring), LAN, WAN, MAN. Internet and World Wide Web (WWW): A Brief History of the Internet and WWW, ARPANet, Internet Services provider and Online Services Providers, Web Link, Browser, Function, and Features of Browser, Search Engines. Common Services are available on the Internet. Multimedia Website Design. Business on Web: E-Commerce, E-Commerce business models, B2C, C2C, B2G, and Types of E-Commerce Websites. Information Security and Privacy: Significance of Information Security and Privacy in the Information Age. Computer Sabotage, Computer Virus, and Malware, DoS Attack. Online Data, Information, and Identity theft, Online Frauds, Internet Scam, Phishing and Pharming, Privacy and Security Issues in Social Media.', 'Livesley, Robert Kenneth. An introduction to automatic digital computers. Cambridge University Press, 2017. Zawacki-Richter, Olaf, and Colin Latchem. "Exploring four decades of research in Computers & Education." Computers & Education 122 (2018): 136-152. Sinha, Pradeep K., and Priti Sinha. Computer fundamentals. BPB publications, 2010. Goel, Anita. Computer fundamentals. Pearson Education India, 2010.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'GE-161L', 'Introduction to ICT Lab', 1, 'Lab', 'General Education', 1, 'Joan Lambert, Curtis Frye, Microsoft Office 2019 Step by Step, First Edition. ISBN: 978-1-50-930597-1. Craig Zacker, Microsoft Official Academic Course, MICROSOFT WORD 2016, Wiley Publisher, 2016. ISBN: 978-1-11-927299-1 Joyce J. Nielsen, Microsoft Official Academic Course, MICROSOFT EXCEL 2016, Wiley Publisher, 2016. ISBN: 978-1-11-927300-4 Mary Lemons, Microsoft Official Academic Course, MICROSOFT POWERPOINT 2016, Wiley Publisher, 2016. ISBN: 978-1-11-927303-5. Mary Lemons, Microsoft Official Academic Course, MICROSOFT ACCESS 2016, Wiley Publisher, 2016. ISBN: 978-1-11-927443-8. Jennifer Niederst Robbins, Learning, Web Design A Beginner''s Guide To HTML, CSS, JavaScript, and Web Graphics, 5th Edition, ISBN: 978-1-491-96020-2.', 'Hardware and Operating Systems: Interaction with CPU components and various hardware devices, familiarity with PC Troubleshooting, familiarity with network connectivity, Microsoft Windows and Virtual Box installations, Linux installation in Virtual Box, basic operations of Microsoft Windows, use of Command Line Interface in MS-DOS and Linux, installation of different application Software. Productivity Software: Document editing and formatting to prepare a broad range of documents including CVs, applications, letters, reports, and business documents using Microsoft Word. Use of Microsoft Excel tools and functions which are most useful to improve daily operational efficiency including data acquisition, formulas, data manipulation, data analysis and graphing, etc. Design of presentations using Microsoft PowerPoint. Graphics design using basic graphics designing tool. Searching and Managing Information: Search engines, information retrieval from search engines, search engines query types. Usage of Google products including drive, docs, sheets, slides, contacts, groups, calendar, meet, forms, maps, sites, Jamboard, etc. Extended Web Utilities: Introduction and usage of useful websites and web portals for education, creativity, recreation, news, etc. Database Management: Introduction to data and information, files and database, creation of tables, forms, queries, reports in Microsoft Access. Usage of various templates in Microsoft Access. Web Design: Design of multimedia website using HyperText Markup Language (HTML), Cascading Style Sheets (CSS), and JavaScript.', 'Jeremy Osborn, Jennifer Smith, Web Design with HTML and CSS Digital Classroom, 2011, ISBN: 978-0-470-58360-9. J. M. Gustafson - HTML5 Web Application Development by Example Beginner''s Guide-Packt Publishing, 2013, ISBN 978-1-84969-594-7.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'CC-111', 'Discrete Structures', 3, 'Core', 'Computing Core', 1, 'Kenneth H. Rosen, Discrete Mathematics and Its Applications, 7th Edition, McGraw Higher-Ed, 2011, ISBN: 0073383090.', 'Mathematical reasoning, propositional and predicate logic, rules of inference, proof by induction, proof by contraposition, proof by contradiction, proof by implication, set theory, relations, equivalence relations and partitions, partial orderings, recurrence relations, functions, mappings, function composition, inverse functions, recursive functions, Number Theory, sequences, series, counting, inclusion and exclusion principle, pigeonhole principle, permutations and combinations, elements of graph theory, planar graphs, graph coloring, euler graph, Hamiltonian path, rooted trees, traversals.', 'Susanna S. Epp, Discrete Mathematics with Applications, 4th Edition. Richard Johnson Baugh, Discrete Mathematics, 7th Edition. Kolman, Busby & Ross, Discrete Mathematical Structures, 4th Edition. Ralph P. Grimaldi, Discrete and Combinatorial Mathematics: An Applied Introduction, 5th Edition. Winifred Grassman, Logic and Discrete Mathematics: A Computer Science Perspective, 1st Edition.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'MS-152', 'Probability & Statistics', 3, 'Core', 'Math & Science Foundation', 1, 'Probability and Statistics for Engineers and Scientists by Ronald E. Walpole, Raymond H. Myers, Sharon L. Myers and Keying E. Ye, Pearson; 9th Edition (January 6, 2011). ISBN-10: 0321629116', 'Introduction to Statistics and Data Analysis, Statistical Inference, Samples, Populations, and the Role of Probability. Sampling Procedures. Discrete and Continuous Data. Statistical Modeling. Types of Statistical Studies. Probability: Sample Space, Events, Counting Sample Points, Probability of an Event, Additive Rules, Conditional Probability, Independence, and the Product Rule, Bayes’ Rule. Random Variables and Probability Distributions. Mathematical Expectation: Mean of a Random Variable, Variance and Covariance of Random Variables, Means and Variances of Linear Combinations of Random Variables, Chebyshev’s Theorem. Discrete Probability Distributions. Continuous Probability Distributions. Fundamental Sampling Distributions and Data Descriptions: Random Sampling, Sampling Distributions, Sampling Distribution of Means and the Central Limit Theorem. Sampling Distribution of S2, t-Distribution, F- Quantile and Probability Plots. Single Sample & One- and Two-Sample Estimation Problems. Single Sample & One- and Two-Sample Tests of Hypotheses. The Use of P-Values for Decision Making in Testing Hypotheses (Single Sample & One- and Two-Sample Tests), Linear Regression and Correlation. Least Squares and the Fitted Model, Multiple Linear Regression and Certain, Nonlinear Regression Models, Linear Regression Model Using Matrices, Properties of the Least Squares Estimators.', 'Probability and Statistics for Engineers and Scientists by Anthony J. Hayter, Duxbury Press; 3rd Edition (February 3, 2006), ISBN-10:0495107573 Schaum''s Outline of Probability and Statistics, by John Schiller, R. Alu Srinivasan and Murray Spiegel, McGraw-Hill; 3rd Edition (2008). ISBN-10:0071544259');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'GE-162', 'English Composition & Comprehension', 3, 'General Education', 'General Education', 1, 'College Writing Skills with Readings, by John Langan, McGraw-Hill, 5th Edition.', 'Paragraph and Essay Writing, Descriptive Essays; Sentence Errors, Persuasive Writing; How to give presentations, Sentence Errors; Oral Presentations, Comparison and Contrast Essays, Dialogue Writing, Short Story Writing, Review Writing, Narrative Essays, Letter Writing', 'A Textbook of English Prose and Structure by Arif Khattak, et al, GIKI Institute, 2000');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'MS-151', 'Applied Physics', 3, 'Core', 'Math & Science Foundation', 1, 'Fundamentals of Physics (Extended), 10th edition, Resnick and Walker', 'Electric force and its applications and related problems , conservation of charge, charge quantization, Electric fields due to point charge and lines of force. Ring of charge, Disk of charge, A point charge in an electric field, Dipole in a n electric field, The flux of vector field, The flux of electric field, Gauss’ Law, Application of Gauss’ Law, Spherically symmetric charge distribution, A charge isolated conductor, Electric potential energy, Electric potentials, Calculating the potential from the field and related problem Potential due to point and continuous charge distribution, Potential due to dipole, equipotential surfaces, Calculating the field from the potential , Electric current, Current density, Resistance, Resistivity and conductivity, Ohm’s law and its applications, The Hall effect, The magnetic force on a current, The Biot- Savart law, Line of B, Two parallel conductors, Amperes’ s Law, Solenoid, Toroids, Faraday’s experiments, Faraday’s Law of Induction, Lenz’s law, Motional emf, Induced electric field, Induced electric fields, The basic equation of electromagnetism, Induced Magnetic field, The displacement current, Reflection and Refraction of light waves, Total internal reflection, Two source interference, Double Slit interference, related problems, Interference from thin films, Diffraction and the wave theory, related problems, Single-Slit Diffraction, related problems, Polarization of electromagnetic waves, Polarizing sheets, related problems.', 'Narciso Garcia, Arthur Damask, Steven Schwarz., “Physics for Computer Science Students”, Springer Verlag, 1998');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'MD-001', 'Math Deficiency - I', 3, 'Core', 'Deficiency Course (non-credit, pass/fail; pre-medical students only)', 1, 'Textbook of Algebra and Trigonometry Class XI is published by Punjab Textbook Board (PTB) Lahore, Pakistan. Calculus and Analytic Geometry, MATHEMATICS 12 (Mathematics FSc Part 2 or HSSC-II), Punjab Text Book Board Lahore, Pakistan', 'Sets: Definition, various types of set representation, and operations. Relation and Function: Graphical transformation of one and two-dimensional functions, Properties of functions, composition, and inverses of functions, domain and range of the functions, Maximum and minimum values of functions, increasing and decreasing functions, zeros and intercept of functions, piecewise functions, continuity and Discontinuity of functions, polynomials and rational functions, Polynomial long division and Synthetic division, Solution of rational functions, Absolute valued function, properties of absolute valued functions, Asymptotes (Horizontal, vertical and oblique), Exponential functions and their properties, Logs functions and their properties. Systems of Equations: Systems of Two Equations and Two Unknowns, Systems of Three Equations and Three Unknowns. Matrix Algebra: Addition, subtraction, and multiplication. Row Operations and Row Echelon Forms, Augmented Matrices, Determinant of Matrices (2 x 2 and higher-order matrices), Cramer’s Rule, Inverse Matrices. Series and Sequences. Trigonometry: Angles in Radians and Degrees, Right Triangle Trigonometry, Law of Cosines & Sines, Area of Triangle, Graphs of Other Trigonometric Functions, Graphs of Inverse Trigonometric Functions, Basic Trigonometric Identities (Pythagorean, Sum and Difference, Double, Half, and Power Reducing), Trigonometric Equations. General Form of a Conic: Parabolas, Circles, Ellipses, Hyperbolas, Degenerate Conics. Polar and Parametric Equations: Polar and Rectangular Coordinates.', 'Gilbert, S. S., B. C. Andy and B. Andrew, B. 2005. Linear Algebra and Its Applications. 4th Ed. Thomson Brooks/Cole, Belmont, CA, USA.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'DC-121', 'Digital Logic Design', 3, 'Core', 'Domain Core', 2, 'Digital Fundamentals by Floyd, 11/e.', 'Number Systems, Logic Gates, Boolean Algebra, Combination logic circuits and designs, Simplification Methods (K-Map, Quinn Mc-Cluskey method), Flip Flops and Latches, Asynchronous and Synchronous circuits, Counters, Shift Registers, Counters, Triggered devices & its types. Binary Arithmetic and Arithmetic Circuits, Memory Elements, State Machines. Introduction Programmable Logic Devices (CPLD, FPGA); Lab Assignments using tools such as Verilog HDL/VHDL, MultiSim', 'Fundamental of Digital Logic with Verilog Design, Stephen Brown, 2/e.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'DC-121L', 'Digital Logic Design Lab', 1, 'Lab', 'Domain Core', 2, 'Digital Design, M. Morris Mano, Pearson Education, 3rd Edition, 2004', 'The course aims at providing knowledge of various logic gates and flip flops and their characteristic truth tables to enable students to design and analyze combinational and sequential circuits. The important combinational circuits e.g., encoders, decoders, multiplexer, de-multiplexer and their applications are discussed in length. Students should be able to design a simple ALU using these standard circuits. In sequential circuits, construction and design of various registers, counters, memories and their applications are discussed. Finally the course terminates at the introduction of some combinational programming devices (PROM, PLA, PAL) and sequential programming devices (SPLD, CPLD, FPGA) and their usage in the industry', 'Digital Fundamentals, T. L. Floyd, Prentice Hall, 8th Edition, 2002');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'GE-163', 'Islamic Studies', 2, 'General Education', 'General Education', 2, 'M. Hamidullah, Introduction to Islam, Kitab Bhavan, 1992, ISBN: 8171511546. Ahmad Hasan, Principles of Islamic Jurisprudence, Islamic Research Institute, IIU, Islamabad, 1993, ISBN: 8174350292.', 'Basic Themes of Quran, Introduction to Sciences of Hadith, Introduction to Islamic Jurisprudence, Primary & Secondary Sources of Islamic Law, Makken & Madnian life of the Prophet, Islamic Economic System, Political theories, Social System of Islam.', 'Mir Waliullah, Muslim Jurisprudence and the Quranic Law of Crimes, 2nd Edition, Taj Publishers, 1986, ISBN: 8185213097.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'GE-164', 'Communication & Presentation Skills', 3, 'General Education', 'General Education', 2, 'Practical Business English, Collen Vawdrey, 1993, ISBN = 0256192740', 'Principles of writing good English, understanding the composition process: writing clearly; words, sentence and paragraphs; Comprehension and expression; Use of grammar and punctuation. Process of writing, observing, audience collecting, composing, drafting and revising, persuasive writing, reading skills, listening skills and comprehension, skills for taking notes in class, skills for exams; Business communications; planning messages, writing concise but with impact. Letter formats, mechanics of business, letter writing, letters, memo and applications, summaries, proposals, writing resumes, styles and formats, oral communications, verbal and non-verbal communication, conducting meetings, small group communication, taking minutes. Presentation skills; presentation strategies, defining the objective, scope and audience of the presentation, material gathering material organization strategies, time management, opening and concluding, use of audio-visual aids, delivery and presentation.', 'Effective Communication Skills: The Foundations for Change, John Nielsen, 2008, ISBN = 1453506748');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'MS-153', 'Linear Algebra', 3, 'Core', 'Math & Science Foundation', 2, 'Elementary Linear Algebra by Howard Anton.', 'Algebra of linear transformations and matrices. determinants, rank, systems of equations, vector spaces, orthogonal transformations, linear dependence, linear Independence and bases, eigenvalues and eigenvectors ,characteristic equations, Inner product space and quadratic forms', 'Linear Algebra and its Applications by Gibert Strang.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'GE-165', 'Pakistan Studies', 2, 'General Education', 'General Education', 2, 'The Emergence of Pakistan, Chaudary M., 1967', 'Historical background of Pakistan: Muslim society in Indo-Pakistan, the movement led by the societies, the downfall of Islamic society, the establishment of British Raj- Causes and consequences. Political evolution of Muslims in the twentieth century: Sir Syed Ahmed Khan; Muslim League; Nehru; Allama Iqbal: Independence Movement; Lahore Resolution; Pakistan culture and society, Constitutional and Administrative issues, Pakistan and its geo-political dimension, Pakistan and International Affairs, Pakistan and the challenges ahead.', 'The making of Pakistan, Aziz. 1976 A Short History of Pakistan, I. H. Qureshi, ed., Karachi, 1988');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'CC-112', 'Programming Fundamentals', 3, 'Core', 'Computing Core', 2, 'Tony Gaddis, Starting with C++: from control structures through objects, 7th Ed., Addison-Wesley, 2012, ISBN 978-0-13-257625-3', 'Introduction to problem solving, a brief review of Von-Neumann architecture, Introduction to programming, role of compiler and linker, introduction to algorithms, basic data types and variables, input/output constructs, arithmetic, comparison and logical operators, conditional statements and execution flow for conditional statements, repetitive statements and execution flow for repetitive statements, lists and their memory organization, multi-dimensional lists, introduction to modular programming, function definition and calling, stack rolling and unrolling, string and string operations, pointers/references, static and dynamic memory allocation, File I/O operations', 'Starting out with Python, 4th Edition, Tony Gaddis. Starting out with Programming Logic & Degins, 4th Edition, Tony Gaddis, The C Programming Language, 2nd Edition by Brian W. Kernighan, Dennis M. Ritchie Object Oriented Programming in C++ by Robert Lafore Introduction to Computation and Programming Using Python: With Application to Understanding Data, 2nd Edition by Guttag, John Practice of Computing Using Python, 3rd Edition by William Punch & Richard Enbody C How to Program, 7th Edition by Paul Deitel & Harvey Deitel Problem Solving and Program Design in C++, 7th Edition by Jeri R. Hanly & Elliot B. Koffman');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'CC-112L', 'Programming Fundamentals Lab', 1, 'Lab', 'Computing Core', 2, 'Tony Gaddis, Starting with C++: from control structures through objects, 7th Ed., Addison-Wesley, 2012, ISBN 978-0-13-257625-3', 'Implementation: the concepts studied in “CC-112 Programming Fundamentals”, Flowcharts/Pseudo Codes. Basic C++ Language Constructs: Datatypes, Variable and Constants, Operator and Expressions, Input and Output (I/O), Formatted I/O, Escape Sequences Decision Making: using if/switch control structure. Repetition: using for and do while. Functions: prototype, parameter, and arguments call by value, and call by reference. Library and Header Files. Arrays: Passing Arrays to function, multi-dimensional arrays, searching, and sorting. Pointers: pointer definition, pointer arithmetic, constant pointers, pointer, and arrays. Dynamic Memory Allocation. User-Defined Data Types: structures, definition, initialization, accessing members of structures, typedef, unions. C File Processing: files and streams, Sequential Access File, Random Access File, Secondary Storage I/O. Command Line Arguments.', 'D.S. Malik, C++ Programming, From Problem Analysis to Program Design, 5th Ed., Course Technology, 2011, ISBN: 978-0-538-79813-6 Brian W. Kernighan, Dennis M. Ritchie, The C Programming Language, 2nd Ed., Prentice-Hall, 1988, ISBN: 978-0131103627. Bjarne Stroustrup, The C++ Programming Language, 4th Edition, Addison- Wesley, 2013, ISBN 978-0321563842.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'MD-002', 'Math Deficiency - II', 3, 'Core', 'Deficiency Course (non-credit, pass/fail; pre-medical students only)', 2, 'Textbook of Algebra and Trigonometry Class XI is published by Punjab Textbook Board (PTB) Lahore, Pakistan. Calculus and Analytic Geometry, MATHEMATICS 12 (Mathematics FSc Part 2 or HSSC-II), Punjab Text Book Board Lahore, Pakistan', 'Complex Numbers: Complex Numbers, Arithmetic with Complex Numbers (Add, subtract, multiply and divide complex numbers), Trigonometric Polar Form of Complex Numbers, De Moivre’s Theorem and nth Roots, Recursion. Sequences and Series: Sigma Notation, Arithmetic Series, Geometric Series (Sum infinite and finite geometric series and categorize geometric series). Counting with Permutations and Combinations. Basic Probability. Binomial Theorem. Limit: Notation, Graphs to Find Limits, Tables to Find Limits, Substitution to Find Limits, Rationalization to Find Limits, One-Sided Limits, and Continuity. Rate of Change: Instantaneous Rate of Change, Tangent Lines, and Rates of Change. Derivatives: The Derivative Function, Introduction to Techniques of Differentiation, The Product and Quotient Rules, Derivatives of Trigonometric Functions, The Chain Rule, Derivatives of Logarithmic Functions, Derivatives of Exponential and Inverse Trigonometric Functions. Increase, Decrease, and Concavity, Relative Extrema, Absolute Maxima and Minima. Integrals: An Overview of the Area Problem, Area Under a Curve, The Indefinite Integral, Integration by Substitution, The Definition of Area as a Limit; Sigma Notation, The Definite Integral.', 'Mark J. Christensen, Computing for Calculus, 1st Edition, Academic Press, (1st January 1981), 240 pages, ISBN: 9781483271088. Lay, L. D. 2015. Probability and Statistics for Engineering and the Sciences, 9th Ed. Cengage Learning, Boston, MA, USA. Howard, Anton, Irl Bivens, Stephen Davis, Calculus, 11th Ed, 2011, John Wiley & Sons, Inc. (1318 Pages)');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'DC-221', 'Comp. Organization & Assembly Language', 3, 'Core', 'Domain Core', 3, 'Computer Systems: A Programmer''s Perspective, 3/E (CS:APP3e), Randal E. Bryant and David R.O'' Hallaron, Carnegie Mellon University', 'Introduction to computer systems: Information is bits + context, programs are translated by other programs into different forms, it pays to understand how compilation systems work, processors read and interpret instructions stored in memory, caches matter, storage devices form a hierarchy, the operating system manages the hardware, systems communicate with other systems using networks; Representing and manipulating information: information storage, integer representations, integer arithmetic, floating point; Machine-level representation of programs: a historical perspective, program encodings, data formats, accessing information, arithmetic and logical operations, control, procedures, array allocation and access, heterogeneous data structures, putting it together: understanding pointers, life in the real world: using the gdb debugger, out-of-bounds memory references and buffer overflow, x86-64: extending ia32 to 64 bits, machine-level representations of floating-point programs; Processor architecture: the Y86 instruction set architecture, logic design and the Hardware Control Language (HCL), sequential Y86 implementations, general principles of pipelining, pipelined Y86 implementations', 'Robert Britton, MIPS Assembly Language Programming, Latest Edition, Computer System Architecture, M. Morris Mano, Latest Edition, Assembly Language Programming for Intel- Computer, Latest Edition');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'DC-221L', 'Comp. Organization & Assembly Language Lab', 1, 'Lab', 'Domain Core', 3, 'Kip R. Irvine, Assembly Language for Intel Based Computers, Third Edition, 1999, Prentice-Hall Publishing, 1999, ISBN-10: 0132383101', 'Student should be able to  Understand the link between High-Level Language (C Language), Assembly Language (MIPS Assembly) and Machine Language.  Use the MIPS Assembly Language as an example.  The arithmetic of the computer.  The design of a basic 5-stage single cycle Processor. The design of a basic 5-stage pipelined Processor.  Data and Control hazards in pipelining.  Memory hierarchy Design.  Storage and I / O.  Designing and implementing a comprehensive hardware project. Instruction set architecture. Accumulator based, Stack Based and General Purpose Register Organization. Processor’s Data Path. Design of a basic computer highlighting the timing and control system in instruction execution cycle. Interrupts, traps and signals. Comparison of Intel 80x86 and MIPS architectures. Addressing Modes. Mapping of High level language to corresponding assembly and machine language. Memory and Cache organization techniques. I/O techniques (Memory mapped and isolated I/O). Latest trends in Architectures.', 'Assembly Language Reference by Que. Corporation');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'UE-271', 'Introduction to Economics', 3, 'Elective', 'University Elective', 3, 'Economics by McConnell and Brue, Latest Edition. Economics Today by Roger Leroy Miller, Latest Edition. Economics’ Paul A. Samuelson & William D. Nordhaus, 19th Edition, McGraw Hill Publications.', 'Nature and scope of economics, the subject matter of economic, Theory of consumer behavior, Cardinal Approach, Ordinal Approach, Theory of demand, Theory of supply, Determination of a value of a commodity Analysis of market mechanism, Determinants of market forces, Demand Supply equations, Elasticity of demand, Elasticity of supply, Cost of Production (sunk cost, explicit cost, implicit cost, total opportunity cost, total fixed cost, Numerical), Total variable cost, total cost, average total cost, average variable cost, average fixed, marginal cost), Types of markets (perfect competition, firm equilibrium under PC, profit and loss determination under PC, firm equilibrium under long run), Monopoly, oligopoly, monopolistic competition, Revenue curves (Average revenue, marginal revenue, total revenue), Factor market analysis (distribution of income & wealth, rent determination, supply of labor), The circular flow of income and product, Society’s technological possibilities, three basic economic problems, the economic role of Government, National accounting, national income measurement, GDP, income and growth, Money, finance and the concepts of open economy, AD and AS Model, Business Cycle, Central Bank – Monetary Policy, Federal Budget, Role of Government- fiscal policy, Current Budget and Government policies Discussion, Inflation and causes of Inflation, Unemployment and causes of unemployment, Investment Choices-Risk and Return, International Trade- Exchange Rate, Software Industry Analysis.', 'Economics’ by Edwin G. Dolan & David D Lindsey Dryden Press, International Edition, Chicago. (For case studies). Workbook for Economics by Begg, Fischer and Dornbusch McGraw Hill Higher education, 7th Edition. (For IS-LM analysis). Workbook Modern Economics by J. Harvey English Language Book Society Publications. Principles of Economics by Salvatore and Diuluo, McGraw Hill Publications, Schaum’s outline series');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'CC-211', 'Object Oriented Programming', 3, 'Core', 'Computing Core', 3, 'H. M. Deitel, P. J. Deitel, C++ How to Program, 10th Ed., Prentice-Hall.', 'Introduction: Object-oriented design, history, and advantages of object-oriented design. Object Oriented Programming: Terminology and features, classes, objects, data encapsulation, constructors, destructors, access modifiers, const vs non-const functions, static data members & functions, function overloading, operator overloading, identification of classes and their relationships, composition, aggregation, inheritance, multiple inheritances, polymorphism, abstract classes, and interfaces. Generic Programming: Concepts, function & class templates, standard template library. Object Streams: Data and object serialization using object streams. Exception Handling.', 'Starting Out with C++ from Control Structures to Objects, 9th Edition, Tony Gaddis Object Oriented Programming in C++, 3rd Edition by Robert Lafore Java: How to Program, 9th Edition by Paul Deitel Beginning Java 2, 7th Edition by Ivor Horton An Introduction to Object Oriented Programming with Java, 5th Edition by C. Thomas Wu');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'CC-211L', 'Object Oriented Programming Lab', 1, 'Lab', 'Computing Core', 3, 'H. M. Deitel, P. J. Deitel, C++ How to Program, 5th Ed., Prentice-Hall, 2005, ISBN: 0-13-185757-6.', 'Implementation: the concepts studied in “CC-211 Object Oriented Programming”, Review: Data-Driven Programming. Classes and Objects: Defining Classes and Object Initialization, setter/getter, Constructor/Destructor. Resource Management: Allocation/De-Allocation, const data members and function. Composition: Aggregation, Friend function/classes, Generalization, Multilevel/Multiple Inheritance, Runtime Polymorphism, Singleton/Proxy/Adapter Pattern, Ad Hoc Polymorphism. Templates. Stream I/O. File Processing. Exception Handling.', 'R. Lafore, Object-Oriented Programming in C++, 4th Ed., Sams Publishing, 2002, ISBN: 0-672-32308-7. Victor Shtern, Core C++ A Software Engineering Approach, 1st Ed., Prentice Hall PTR, 2000, ISBN: 0-13-085729-7. Stephen Parata, C++ Primer Plus, 5th Ed., Sams Publishing, 2005, ISBN: 0-672- 32697-3. Bjarne Stroustrup, The C++ Programming Language, 4th Ed., Addison Wesley, 2013, ISBN: 0-321-56384-0.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'MS-251', 'Calculus & Analytical Geometry', 3, 'Core', 'Math & Science Foundation', 3, 'Calculus and Analytic Geometry by Kenneth W. Thomas.', 'Limits and Continuity; Introduction to functions, Introduction to limits, Techniques of funding limits, Indeterminate forms of limits, Continuous and discontinuous functions and their applications, Differential calculus; Concept and idea of differentiation, Geometrical and Physical meaning of derivatives, Rules of differentiation, Techniques of differentiation, Rates of change, Tangents and Normals lines, Chain rule, implicit differentiation, linear approximation, Applications of differentiation; Extreme value functions, Mean value theorems, Maxima and Minima of a function for single-variable, Concavity, Integral calculus; Concept and idea of Integration, Indefinite Integrals, Techniques of integration, Riemann sums and Definite Integrals, Applications of definite integrals, Improper integral, Applications of Integration; Area under the curve, Analytical Geometry; Straight lines in R3, Equations for planes.', 'Calculus by Stewart, James. Calculus by Earl William Swokowski; Michael Olinick; Dennis Pence; Jeffery A. Cole.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'GE-261', 'Professional Practices', 3, 'General Education', 'General Education', 3, 'Professional Issues in Software Engineering by Frank Bott, Allison Coleman, Jack Eaton and Diane Rowland, CRC Press; 3rd Edition (2000). ISBN-10: 0748409513', 'Computing Profession, Computing Ethics, Philosophy of Ethics. The Structure of Organizations, Finance and Accounting, Anatomy of a Software House, Computer Contracts, Intellectual Property Rights, The Framework of Employee Relations Law and Changing Management Practices, Human Resource Management and IT, Health and Safety at Work, Software Liability, Liability and Practice, Computer Misuse and the Criminal Law, Regulation and Control of Personal Information. Overview of the British Computer Society Code of Conduct, IEEE Code of Ethics, ACM Code of Ethics and Professional Conduct, ACM/IEEE Software Engineering Code of Ethics and Professional Practice. Accountability and Auditing, Social Application of Ethics.', 'Computer Ethics by Deborah G. Johnson, Pearson; 4th Edition (January 3, 2009). ISBN-10: 0131112414 A Gift of Fire: Social, Legal, and Ethical Issues for Computing and the Internet (3rd Edition) by Sara Baase, Prentice Hall; 3rd Edition (2008). ISBN-10: 0136008488 Applied Professional Ethics by Gregory R. Beabout, University Press of America (1993). ISBN-10: 0819193747.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'UE-272', 'Introduction to Psychology', 3, 'Elective', 'University Elective', 4, 'Ricky W. Griffin, Management, 12th Edition, Cengage Learning, 2017, ISBN: 1305501292.', 'Managing and the Managers Job: The management process, kinds of managers, basic managerial roles and skills, and the nature of managerial work. The Environment and Culture of Management: The external and internal environment, the organization’s cultures, organization-environment relationship. Planning and Decision Making: Decision making and planning process, organizational goals and levels of planning, various levels of strategies, rational perspectives on decision making, behavioral aspects of decision making, group and team decision making in organizations. The Organizing Process: Designing Jobs, grouping jobs, establishing reporting relationships, distributing authority, coordinating activities. Managing Change and Innovation: Forces for change, steps in the change process, understanding and overcoming resistance to change, the innovation process. Leadership and Influence Process: Different approaches to leadership, political behavior in organizations. The Controlling Process: The purpose of control, steps in the control process; operational, structural, and strategic control, managing total quality and productivity. The Ethical and Social Environment: Individual ethics in an organization, emerging ethical issues, social responsibility, and organizations.', 'Stephen P Robbins, Mary Coulter, Management, 14th Edition, Pearson, 2017, ISBN: 0134527607.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'SC-241', 'Multivariate Calculus', 3, 'Core', 'CS Supporting', 4, 'Multivariable Calculus, 6th edition James, Stewart 2007 Cengage Learning publishers.', 'Functions of Several Variables and Partial Differentiation. Multiple Integrals, Line and Surface Integrals. Green’s and Stoke’s Theorem. Fourier Series: periodic functions, Functions of any period P-2L, Even & odd functions, Half Range expansions, Fourier Transform; Laplace Transform, Z-Transform.', 'Calculus and Analytical Geometry, 6th edition. Swokowski, Olinick and Pence.1994.Thomson Learning EMEA, Ltd. Multivariable Calculus, 5th edition Howard, A. Albert, H. 1995, John Wiley.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'DC-222', 'Theory of Automata', 3, 'Core', 'Domain Core', 4, 'Introduction to computer theory, Daniel I. A. Cohen, 2nd Edition', 'Finite State Models: Language definitions preliminaries, Regular expressions/Regular languages, Finite automata (FAs), Transition graphs (TGs), NFAs, Kleene’s theorem, Transducers (automata with output), Pumping lemma and non-regular language Grammars and PDA: CFGs, Derivations, derivation trees and ambiguity, Simplifying CFLs, Normal form grammars and parsing, Decidability, Context sensitive languages, grammars and linear bounded automata (LBA), Chomsky’s hierarchy of grammars Turing Machines Theory: Turing machines, Post machine, Variations on TM, TM encoding, Universal Turing Machine, Defining Computers by TMs.', 'Automata, Computability and Complexity: Theory and Applications, by Elaine Rich, 2011 An Introduction to Formal Languages and Automata, by Peter Linz, 4th edition, Jones & Bartlett Publishers, 2006 Theory of Automata, Formal Languages and Computation, by S. P. Eugene, Kavier, 2005, New Age Publishers');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'CC-212', 'Software Engineering', 3, 'Core', 'Computing Core', 4, 'Ian Sommerville, Software Engineering, 10th Edition, Pearson, 2015, ISBN- 13: 978-0133943030.', 'Nature of Software, Overview of Software Engineering, Professional software development, Software engineering practice, Software process structure, Software process models, Agile software Development, Agile process models, Agile development techniques, Requirements engineering process, Functional and non-functional requirements, Context models, Interaction models, Structural models, behavioral models, model driven engineering, Architectural design, Design and implementation, UML diagrams, Design patterns, Software testing and quality assurance, Software evolution, Project management and project planning, configuration management, Software Process improvement.', 'Software Engineering, A Practitioner’s Approach, Pressman R. S.& Maxim B. R., 8th Edition, McGraw-Hill, 2015.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'CC-213', 'Data Structures & Algorithms', 3, 'Core', 'Computing Core', 4, 'Ellis Horowitz, Sartaj Sahni, D. Mehta, Fundamentals of Data Structures in C++, 2nd Ed., Computer Science Press, 1995. ISBN 81-7808-792-8. Adam B. Drozdek, Data Structure and Algorithm in C++, 4th Ed., Cengage Learning, ISBN 978-1133608424.', 'Abstract data types, complexity analysis, Big Oh notation, Stacks (linked lists and array implementations), Recursion and analyzing recursive algorithms, divide and conquer algorithms, Sorting algorithms (selection, insertion, merge, quick, bubble, heap, shell, radix, bucket), queue, dequeuer, priority queues (linked and array implementations of queues), linked list & its various types, sorted linked list, searching an unsorted array, binary search for sorted arrays, hashing and indexing, open addressing and chaining, trees and tree traversals, binary search trees, heaps, M-way tress, balanced trees, graphs, breadth-first and depth-first traversal, topological order, shortest path, adjacency matrix and adjacency list implementations, memory management and garbage collection.', 'Data Structures and Algorithms in C++ by Adam Drozdek Data Structures and Algorithm Analysis in Java by Mark A. Weiss Data Structures and Abstractions with Java by Frank M. Carrano & Timothy M. Henry Data Structures and Algorithm Analysis in C++ by Mark Allen Weiss Java Software Structures: Designing and Using Data Structures by John Lewis and Joseph Chase');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'CC-213L', 'Data Structures & Algorithms Lab', 1, 'Lab', 'Computing Core', 4, 'Ellis Horowitz, Sartaj Sahni, D. Mehta, Fundamentals of Data Structures in C++, 2nd Ed., Computer Science Press, 1995. ISBN 81-7808-792-8.', 'Implementation: the concepts studied in “CC-213 Data Structures and Algorithms”, Performance Analysis/Measurement, Sparse Matrices, N- Dimensional Arrays. Stack: Expressions Evaluation. Recursion: Backtracking. Queue: Double Ended Queue, Self-Referencing Classes, and Dynamic Memory Allocation. Linked List: Singly Linked Lists, Circular Lists, Linked Stacks and Queues (Double Ended List), Doubly Linked Lists. Trees: Binary Trees, Binary Search Tree, Introduction to Height Balanced and AVL Trees, Heaps and Heaps as Priority Queues, Double Ended Priority Queue. Searching: Linear Search, Binary Search, and Types of Indexing. Hashing: Hash Functions, Collision Resolution: Open Hashing, Chaining. Sorting: Logical and Algorithmic Implementation of Selection, Bubble, Insertion, Shell, Radix, Merge, Quick, Heap Sort. Graphs: Graph terminology, Adjacency List and Adjacency Matrix, and Adjacency list representation of Graph. Elementary Graph Operations: Breadth- First Search and Depth First Search, Spanning Trees (BFSST, DFSST).', 'D. Samanta, Classic Data Structures, Prentice Hall, 2001, ISBN: 812033731X. Mark Allen Weiss, Data Structure and Algorithms in C++, 3rd Ed., Pearson Education, 2006, ISBN: 978-0321441461. Thomas H. Cormen, Charles E. Leiserson, Ronald L. Rivest, Clifford Stein, Introduction to Algorithms, 2nd Ed, MIT Press, 2001, ISBN 0-07-013151-1.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'CC-311', 'Operating Systems', 3, 'Core', 'Computing Core', 5, 'A. Silberschatz, P. B. Galvin, G. Gagne, Operating Systems Concepts, 9th Edition, Wiley, 2012, ISBN: 1118063333.', 'Operating systems basics, system calls, process concept and scheduling, inter- process communication, multithreaded programming, multithreading models, threading issues, process scheduling algorithms, thread scheduling, multiple- processor scheduling, synchronization, critical section, synchronization hardware, synchronization problems, deadlocks, detecting and recovering from deadlocks, memory management, swapping, contiguous memory allocation, segmentation & paging, virtual memory management, demand paging, thrashing, memory-mapped files, file systems, file concept, directory and disk structure, directory implementation, free space management, disk structure and scheduling, swap space management, system protection, virtual machines, operating system security', 'Andrew S. Tanenbaum, Herbert Bos, Modern Operating Systems, 4th Edition, Pearson, 2014, ISBN: 013359162X. William Stallings, Operating Systems: Internals and Design Principles, 9th Edition, Pearson, 2017, ISBN: 0134670957.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'CC-311L', 'Operating Systems Lab', 1, 'Lab', 'Computing Core', 5, 'Sarwar and Koretsky, Unix: The Text Book, 3rd edition, ISBN-13: 978-1-4822- 3358-2.', 'Interacting with Linux Operating System: Virtualization and Hypervisors, Linux distributions. Installing Linux on Sun Virtual Box. Linux File hierarchy standard. File System Architecture: Schematic view of a standard UNIX file system. Describe the contents of boot block, superblock, inode block, and data blocks. File System Mounting: Introduction to the concept of file system mounting. Linux configuration files related to file system mounting. Linux commands like mount, umount, lsblk, blkid. Maintaining the integrity of the file system using Linux commands like fsck, e2fsck, fsck. fat, fsck. nfs. File Permissions: standard file permissions. Use of chmod and chown commands. Setting the default file permissions on a newly created file using the umask command. Special File Permissions: Concept and use of Saved SUID bit on files. Concept and use of Saved SGID bit on files and directories. Concept and use of Sticky bit on files and directories. Device files: Seven File Types in Linux and the concept of device files. Describes the contents of /dev/ directory. Terminal Attributes: Overview of Terminal Devices and a comparison between disk and terminal files. Examine current attributes of the terminal driver on a Linux machine and change them using the stty command. Hard and Soft Links: the use of hard and soft links on all UNIX-based systems. Differences between hard and soft links. Use of Linux command ln to create hard and soft links. Managing services using systemd: Introduction to Linux system daemon. Overview of systemd unit files, especially Targets Unit Files and Service Unit Files. Shell commands to manage services using systemctl. Writing/running a basic service of your own. Booting process of a Linux system: A discussion on five phases of Linux Operating system: BIOS / UEFI Initialization, Master Boot Record, Boot Loader, Kernel Initialization, init or systemd Process. Linux System Programming: Linux System Call Interface, Use of GNU gcc compiler on Linux terminal, Format of a program file on disk and its components. Viewing contents of a program file using objdump and readelf commands. Process Creation and Termination: getpid(), getppid(), fork(), exit(), wait() and execl() system calls. File management in Linux. Concept of PPFDT. Concept of input, output and error redirection. Inter-Process Communication: Linux IPC tools, Pipes, FIFOS, and Sockets. Use of pipes and fifos on a Linux terminal. Signals: Signal delivery and execution of a signal handler. Synchronous and Asynchronous signals. Standard and real-time signals. Sending signals to running processes using the kill command. Signal disposition of some important signals like SIGHUP, SIGINT, SIGKILL, SIGPIPE, SIGALARM, SIGTERM, SIGQUIT, SIGILL, SIGFPE, SIGSEGV, SIGSTOP, SIGTSTP, SIGCHLD, SIGCONT. Threads and Scheduling: Writing multi-threaded C programs using library calls from the POSIX pthread library like pthread_create(), pthread_join(), and pthread_exit(). Use of Linux schedtool command to query and change different CPU scheduling', NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'DC-321', 'Design & Analysis of Algorithms', 3, 'Core', 'Domain Core', 5, 'Introduction to Algorithms (3rd edition) by Thomas H. Corman, Charles E. Leiserson, Ronald L. Rivest and Clifford Stein', 'Introduction; role of algorithms in computing, Analysis on nature of input and size of input Asymptotic notations; Big-O, Big Ω, Big Θ, little-o, little-ω, Sorting Algorithm analysis, loop invariants, Recursion and recurrence relations; Algorithm Design Techniques, Brute Force Approach, Divide-and-conquer approach; Merge, Quick Sort, Greedy approach; Dynamic programming; Elements of Dynamic Programming, Search trees; Heaps; Hashing; Graph algorithms, shortest paths, sparse graphs, String matching; Introduction to complexity classes;', 'Algorithm Design, (1st edition, 2013/2014), Jon Kleinberg, Eva Tardos, Algorithms, (4th edition, 2011), Robert Sedgewick, Kevin Wayne');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'DC-322', 'Compiler Construction', 3, 'Core', 'Domain Core', 5, 'Compilers: Principles, Techniques, and Tools, A. V. Aho, R. Sethi and J. D. Ullman, Addison-Wesley, 2nd ed., 2006', 'Introduction to interpreter and compiler. Compiler techniques and methodology; Organization of compilers; Lexical and syntax analysis; Parsing techniques. Types of parsers, top-down parsing, bottom-up parsing, Type checking, Semantic analyser, Object code generation and optimization, detection and recovery from errors.', 'Modern Compiler Design, D. Grune, H. E. Bal, C. J. H. Jacobs, K. G. Langendoen, John Wiley, 2003. Modern Compiler Implementation in C, A. W. Appel, M. Ginsburg, Cambridge University Press, 2004.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'CC-312', 'Database Systems', 3, 'Core', 'Computing Core', 5, 'Carlos Coronel, Steven Morris, Database Systems: Design, Implementation & Management, 13th Edition, Cengage Learning, 2017. ISBN-10: 1337627909.', 'Basic database concepts, Database approach vs file based system, database architecture, three level schema architecture, data independence, relational data model, attributes, schemas, tuples, domains, relation instances, keys of relations, integrity constraints, relational algebra, selection, projection, Cartesian product, types of joins, normalization, functional dependencies, normal forms, entity relationship model, entity sets, attributes, relationship, entity-relationship diagrams, Structured Query Language (SQL), Joins and sub-queries in SQL, Grouping and aggregation in SQL, concurrency control, database backup and recovery, indexes, NoSQL systems.', 'Jeffrey A. Hoffer, Ramesh Venkataraman, Heikki Topi, Modern Database Management, 12th Edition, Pearson, 2015. ISBN-10: 0133544613. Thomas Connolly, Carolyn Begg, Database Systems: A Practical Approach to Design, Implementation, and Management, 6th Edition, Pearson, 2015. ISBN-10: 1292061189. Ramez Elmasri, Shamkant B. Navathe, Fundamentals of Database Systems, 7th Edition, Pearson, 2016. ISBN-10: 1292097612. C. J. Date, An Introduction to Database Systems, 8th Edition, Pearson, 2004. ISBN- 10: 0321189566. Michael McLaughlin, Oracle Database 11g PL/SQL Programming, 1st Edition, McGraw-Hill Education, 2008, ISBN: 0071494456.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'CC-312L', 'Database Systems Lab', 1, 'Lab', 'Computing Core', 5, 'Michael McLaughlin, Oracle Database 11g PL/SQL Programming, 1st Edition, McGraw-Hill Education, 2008, ISBN: 0071494456.', 'Introduction to SQL environment: Writing Basic SQL Statements; SELECT Statement, Arithmetic Expressions, Operator Precedence, Null Value, Column Alias, Concatenation Operator, Display table Structure. From Clause: Table list, Table Alias. Restricting and Sorting Data; WHERE Clause, Comparison operators, Logical operators, ORDER BY clause; Where Clause: Conditions, logical operators and their precedence, order by clause. Single row functions: character functions, number functions, date functions, type conversion functions. Multi row Functions: Sum, Average, Standard deviation, Variance, Subgrouping of data, Group by Clause, use of Having clause. Join: Cross product, natural join, Equi-join, Non-equijoin, left outer join, right outer-join, self-join. Subquery: use of subquery, subquery syntax, Multiple Column Subqueries, pairwise comparison, Non-pair wise comparison, Null Value in a subquery, Subquery in From Clause. Creating and Altering SQL tables: Create table statement, Defining Constraints, Column Level and Table Level, NOT NULL Constraint, UNIQUE Key Constraint, PRIMARY Key Constraint, FOREIGN Key Constraint, CHECK Constraint, Alter table statement, drop statement, Data Manipulation: Insert, Update, Delete statements. SQL Objects: Views, Sequences, Indexes. User Management: Create user, user privileges, user groups, Grant, Revoke statements.', 'Jeffrey A. Hoffer, Ramesh Venkataraman, Heikki Topi, Modern Database Management, 12th Edition, Pearson, 2015. ISBN-10: 0133544613. Thomas Connolly, Carolyn Begg, Database Systems: A Practical Approach to Design, Implementation, and Management, 6th Edition, Pearson, 2015. ISBN-10: 1292061189.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'EC-331', 'Web Technologies', 3, 'Elective', 'CS Elective', 5, 'Paul J. Deitel and Harvey Deitel, Java How to Program, 11th Edition, Pearson, 2017, ISBN-10: 0134743350, ISBN-13: 978-0134743356.', 'Introduction to Web Applications, TCP/IP Application Services. Web Servers: Basic Operation, Virtual hosting, Chunked transfers, Caching support, Extensibility. SGML, HTML5, CSS3. XML Languages and Applications: Core XML, XHTML, XHTM MP. Web Service: SOAP, REST, WML, XSL. Web Services: Operations, Processing HTTP Requests, Processing HTTP Responses, Cookie Coordination, Privacy and P3P, Complex HTTP Interactions, Dynamic Content Delivery. Server Configuration. Server Security. Web Browsers Architecture and Processes. Active Browser Pages: JavaScript, DHTML, AJAX. JSON, Approaches to Web Application Development. Programing in any Scripting language. Search Technologies. Search Engine Optimization. XML Query Language, Semantic Web, Future Web Application Framework.', 'Marty Hall and Larry Brown, Core Servlets and JavaServer Pages, 2nd Edition, Pearson, 2017, ISBN-10: 8131701638, ISBN-13: 978-8131701638. Web Application Architecture: Principles, protocols and practices by Leon Shklar and Richard Rosen, Wiley; 2nd Edition (May 5, 2009). ISBN- 10:047051860X Web Technologies: A Computer Science Perspective by Jeffrey C. Jackson, Prentice Hall; 1st Edition (August 27, 2006). ISBN-10:0131856030');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'EC-331L', 'Web Technologies Lab', 1, 'Lab', 'CS Elective', 5, 'Paul J. Deitel and Harvey Deitel, Java How to Program, 11th Edition, Pearson, 2017, ISBN-10: 0134743350, ISBN-13: 978-0134743356.', 'Implementation on the compiler of all the concepts/topics discussed in the course which includes, Introduction to Java, Variables, data types, Control Structures, Methods, Classes, Interfaces, Method Overloading and Overriding, Revision of Object-oriented programming courses in Java, GUI development, Event Handling, Database Connectivity, Exception Handling, File handling, HTML, CSS, JavaScript, Server-side Programming in Java, Http Request and Response, Servlets, Servlet Life Cycle, Java Beans, MVC.', 'Marty Hall and Larry Brown, Core Servlets and JavaServer Pages, 2nd Edition, Pearson, 2017, ISBN-10: 8131701638, ISBN-13: 978-8131701638. Web Application Architecture: Principles, protocols and practices by Leon Shklar and Richard Rosen, Wiley; 2nd Edition (May 5, 2009). ISBN- 10:047051860X Web Technologies: A Computer Science Perspective by Jeffrey C. Jackson, Prentice Hall; 1st Edition (August 27, 2006). ISBN-10:0131856030');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'CC-313', 'Computer Networks', 3, 'Core', 'Computing Core', 6, 'James F. Kurose and Keith W. Ross, Computer Networking: A Top-Down Approach Featuring the Internet, 6th Edition, Pearson, 2012, ISBN: 0132856204.', 'Introduction and protocols architecture, basic concepts of networking, network topologies, layered architecture, physical layer functionality, data link layer functionality, multiple access techniques, circuit switching and packet switching, LAN technologies, wireless networks, MAC addressing, networking devices, network layer protocols, IPv4 and IPv6, IP addressing, sub netting, CIDR, routing protocols, transport layer protocols, ports and sockets, connection establishment, flow and congestion control, application layer protocols, latest trends in computer networks.', 'Andrew S. Tanenbaum, David J. Wetherall, Computer Networks, 5th Edition, Prentice-Hall, 2010, ISBN: 9332518742. William Stallings, Data and Computer Communications, 10th Edition, Pearson, 2013, ISBN: 0133506487. Behrouz A. Forouzan, Data Communication, and Computer Networks, 5th Edition, McGraw-Hill, 2012, ISBN: 0073376221.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'CC-313L', 'Computer Networks Lab', 1, 'Lab', 'Computing Core', 6, 'T. Lammle, CCNA Cisco Certified Network Associate Deluxe Study Guide, 6th Edition, Sybex, 2011, ISBN: 978-0-470-90108-3.', 'Introduction to Networks and its Components: Network components, transmission modes, types of connections, physical and logical topologies, performance evaluation parameters for topologies, network types (PAN, LAN, WAN, MAN), data transmission media, guided media vs unguided media. Network Addressing: Physical and logical addresses, IP addressing, class-full addresses, private addresses, loopback addresses, IP Sub-netting, and super- netting. Setting Network Connectivity: Different types of cables available for setting up a small Local Area Network, connectors, cross-over, and straight through cables etc. mastering Ethernet cables (using pin arrangement of T568-A or T568-B) and checking their correctness, Setting up the point-to-point connection between 2 computers. Assigning the IP address to computers and finding out the IP addresses using the ipconfig command. Test connectivity between computers using ping command. Sharing data between computers. Setting Activity Directory on Domain Controller: Installation of Activity Directory on Domain Controller, Manage and Active Directory Forest and domain. Design and OU, Identify GP requirement for OU. Design an OU structure to delegate authority. Design a security group strategy, define administrative access requirements, define user roles. Specify account requirements for users, computers, administrators, and services. Design an AD naming strategy, Design a strategy for GP implementation. Design the Administration of GPOs. Installation and configuration of the File server. Installation and configuration of Quota server. Setting Additional Domain Controller: Installation of Activity Directory on Additional domain controller, Domain synchronization between Domain Controller and Additional domain controller. AD users and group management in Client and Server environment. Design a user and computer authentication strategy. Design a user and computer account strategy. Installation and configuration of Domain name server. Configuration of forward lookup zone. Configuration of reverse looks up zone. Concept of AD-integrated zone, primary zone, secondary zone, and stub zone. Linux OS: Installation of Linux OS and concept of file systems. Usage of basic commands. User management and its permissions. Server Management: Installation of various servers and their configuration like a Samba file server in a workgroup. Samba file server in a domain environment. DHCP server, DNS server, NAT server. Networking Devices and Protocols: Exposition and discussion of various networking devices including Hubs, Switches, Routers, Bridges, Gateways, Repeaters, Amplifiers, Network Interface Cards, Modems, Wireless access points, and BRouters. Exposition and discussion of different protocols working at each layer of OSI and TCP/IP Model. PPP, ARP, RARP, ICMP, UDP, TCP, TELNET, BOOTP, SMTP, SMB, NETBIOS, Exposition, and discussion of well-known services and ports. Wireless Access Points: Installation and configuration of WAP,', 'R. Perlman, Interconnections: Bridges, Routers, Switches, and Internetworking Protocols, 2nd Edition, Addison-Wesley, 1999, ISBN: 0201634481.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'DC-323', 'Parallel & Distributed Computing', 3, 'Core', 'Domain Core', 6, 'Distributed Systems: Principles and Paradigms, A. S. Tanenbaum and M. V. Steen, Prentice Hall, 2nd Edition, 2007', 'Asynchronous/synchronous computation/communication, concurrency control, fault tolerance, GPU architecture and programming, heterogeneity, interconnection topologies, load balancing, memory consistency model, memory hierarchies, Message passing interface (MPI), MIMD/SIMD, multithreaded programming, parallel algorithms & architectures, parallel I/O, performance analysis and tuning, power, programming models (data parallel, task parallel, process-centric, shared/distributed memory), scalability and performance studies, scheduling, storage systems, synchronization, and tools (Cuda, Swift, Globus, Condor, Amazon AWS, OpenStack, Cilk, gdb, threads, MPICH, OpenMP, Hadoop, FUSE).', 'Distributed and Cloud Computing: Clusters, Grids, Clouds, and the Future Internet, K Hwang, J Dongarra and GC. C. Fox, Elsevier, 1st Ed.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'EC-332', 'Enterprise Application Development', 3, 'Elective', 'CS Elective', 6, 'Herbert Schildt, C# 4.0 The Complete Reference, McGraw-Hill, 2010, ISBN: 007174116X. A. Freeman, S. Sanderson, Pro ASP.NET MVC 4, 4th Edition, Apress, 2012, ISBN: 1430242361.', 'Overview of Enterprise Application Development: Microsoft technology history, Introduction to .NET and its architecture, Concept of MSIL, CLR, CLS, CTS, Introduction to .NET framework: Managed and Unmanaged Code, .Net Assembly, Introduction to C# fundamentals, Boxing and Unboxing, Implementing multi-tier architecture. Introduction to ADO.Net: SQL Injection, parameterized queries, Usage of data set, Data adapter and command builder in disconnected model Introduction to delegate: Multicast delegates, Introduction to windows forms, HTML, Introduction to javascript: javascript and its data types, variables, functions, Debugging javascript using Firebug. Introduction to various object models: Browser’s Object (BOM), Document Object Model. Introduction to Jquery: Jquery effects. Introducing LINQ: LINQ to Objects, LINQ to SQL, Query syntax, Operations (projection, filtering and join) using Linq Queries. Introduction to ADO.NET entity framework: The entity data model, CSDL, Eager vs lazy loading, POCO classes, DBContext API, Querying entity data models, Introduction to ASP.NET MVC, MVC application structure, Controllers overview, Action Methods, Parameterized action methods, Introduction to razor syntax, Code expressions, Code Blocks, Implicit Vs Explicit Code Expression, Data annotations, Client and Server Side Validation, Validation and model binding, Validation and model state, MVC Membership, Authorization and security. Introduction to service-oriented architecture: SOAP, WSDL, Service contract, Data contract, XML, WCF bindings, ABC of WCF, Restful services, Consuming rest services (CRUD operations) using Jquery AJAX and JSON, Introduction to web API, Example of web API using CRUD Example, MVC routing.', 'Julia Lerman, Programming Entity Framework, 2nd Edition, O’Reilly, 2010, ISBN: 0596807260. Fabrice Marguerie, Steve Eichert, Jim Wooley, LINQ in Action, Manning Publications, 2008, ISBN: 1933988169. Jeremy McPeak, Beginning JavaScript, 5th Edition, Wiley, 2015, ISBN: 978-1-118- 90333-9. Pablo Cibraro, Kurt Claeys, Fabio Cozzolino, Johann Grabner, Professional WCF 4: Windows Communication Foundation with .NET 4, Wiley, 2010, ISBN: 978-0- 470-56314-4.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'EC-333', 'Mobile Application Development', 3, 'Elective', 'CS Elective', 6, 'Professional Android application development, Reto Meier, Wrox Programmer to Programmer, 2015.', 'Mobiles Application Development Platform; HTML5 for Mobiles; Android OS: Architecture, Framework and Application Development; iOS: Architecture, Framework; Application Development with Windows Mobile; Eclipse; Fragments; Calling Built-in Applications using Intents; Displaying Notifications; Components of a Screen; Adapting to Display Orientation; Managing Changes to Screen Orientation; Utilizing the Action Bar; Creating the User Interface; Listening for UI Notifications; Views; User Preferences; Persisting Data; Sharing Data; Sending SMS Messages; Getting Feedback; Sending E-mail; Displaying Maps; Consuming Web Services Using HTTP; Web Services: Accessing and Creating; Threading; Publishing, Android Applications; Deployment on App Stores; Mobile Programming Languages; Challenges with Mobility and Wireless Communication; Location-aware Applications; Performance/Power Tradeoffs; Mobile Platform Constraints; Emerging Technologies.', 'iOS Programming: The Big Nerd Ranch Guide, Conway, J., Hillegass, A., & Keur, C., 5th Edition, 2014. Android Programming: The Big Nerd Ranch Guides, Phillips, B. & Hardy, B., 2nd Edition, 2014.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'DC-324', 'Artificial Intelligence', 3, 'Core', 'Domain Core', 6, 'Stuart Russell and Peter Norvig, Artificial Intelligence. A Modern Approach, 4th edition, Prentice Hall, Inc., 2020.', 'Introduction (Introduction, basic component of AI, Identifying AI systems, branches of AI, etc.); Reasoning and Knowledge Representation (Introduction to Reasoning and Knowledge Representation, Propositional Logic, First order Logic); Problem Solving by Searching (Informed searching, Uninformed searching, Local searching.); Constraint Satisfaction Problems; Adversarial Search (Min-max algorithm, Alpha beta pruning, Game-playing); Learning (Unsupervised learning, Supervised learning, Reinforcement learning) ;Uncertainty handling (Uncertainty in AI, Fuzzy logic); Recent trends in AI and applications of AI algorithms (trends, Case study of AI systems, Analysis of AI systems)', 'Luger, G.F. and Stubblefield, W.A., 2009. AI algorithms, data structures, and idioms in Prolog, Lisp, and Java. Pearson Addison-Wesley. George F. Luger, Artificial Intelligence - Structures and Strategies for Complex Problem Solving, 6th Edition, Pearson, 2008, ISBN-13: 978-0321545893. Hart, P.E., Stork, D.G. and Duda, R.O., Pattern classification. John Willey & Sons, 2001. Ivan Bratko, Prolog: Programming for Artificial Intelligence, 4th Edition, Pearson, 2011, ISBN-13: 978-0321417466. P. Winston, Artificial Intelligence, 3rd Edition, Pearson, 1992, ISBN-13: 978- 0201533774.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'DC-324L', 'Artificial Intelligence Lab', 1, 'Lab', 'Domain Core', 6, 'Stuart Russell and Peter Norvig, Artificial Intelligence. A Modern Approach, 4th edition, Prentice Hall, Inc., 2020.', 'Implementation of Reasoning and Knowledge Representation, Propositional Logic, First order Logic; Problem Solving by Searching (Informed searching, Uninformed searching, Local searching.); Constraint Satisfaction Problems; Adversarial Search (Min-max algorithm, Alpha beta pruning, Game-playing); Learning (Unsupervised learning, Supervised learning, Reinforcement learning) ;Uncertainty handling (Uncertainty in AI, Fuzzy logic);', 'Luger, G.F. and Stubblefield, W.A., 2009. AI algorithms, data structures, and idioms in Prolog, Lisp, and Java. Pearson Addison-Wesley. George F. Luger, Artificial Intelligence - Structures and Strategies for Complex Problem Solving, 6th Edition, Pearson, 2008, ISBN-13: 978-0321545893. Hart, P.E., Stork, D.G. and Duda, R.O., Pattern classification. John Willey & Sons, 2001. Ivan Bratko, Prolog: Programming for Artificial Intelligence, 4th Edition, Pearson, 2011, ISBN-13: 978-0321417466. P. Winston, Artificial Intelligence, 3rd Edition, Pearson, 1992, ISBN-13: 978- 0201533774.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'SC-442', 'Numerical Computing', 3, 'Core', 'CS Supporting', 7, 'Numerical Analysis (9th Edition) by Richard L. Burden, J. Douglas Faires by Brooks/Cole Boston USA, 2011', 'Mathematical preliminaries and error analysis, round-off errors and computer arithmetic, Calculate Divided Differences. Use Divided-difference Table. Find Newton’s Interpolation Polynomial. Calculate Interpolation with Equally Spaced Data. Find the Difference Table. Calculate, Newton’s Forward & Backward Difference Formulae. Use Gauss Formulae. Use Stirling’s Interpolation Formula. Use Bessel’s Interpolation Formula. Use Everett’s Interpolation Formula. Solve Nonlinear Equations. Solve Equations by Bisection Method. Solve Equations by Regula Falsi Method. Solve Equations by Secant Method. Solve Equations by Newton-Raphson Method. Find Fixed Point Iteration. Solve Equations by Jacobi Iterative Methods. Solve Equations by Gauss Seidel Method Calculate Numerical Differentiation. Find Numerical Differentiation Formulae Based on Equally Spaced Data. Find Numerical Differentiation Based on Newton’s Forward Differences. Find Numerical Differentiation Based on Newton’s Backward Differences. Find Numerical Differentiation Based on Stirling’s Formula. Find Numerical Differentiation Based on Bessel’s Formula. Find Numerical Differentiation Based on Lagrange’s Formula. Calculate Error Analysis of Differentiation Formulae. Solve Richardson Extrapolation. Calculate Numerical Integration. Use Trapezoidal Rule with Error Term. Use Simpson’s 1/3 Rule with Error Term. Use Simpson’s 3/8 Rule with Error Term. Use Composite Numerical Integration. Use Composite Trapezoidal Rule. Use Composite Simpson’s Rule. Find Richardson’s Extrapolation. Find Newton-Cotes Closed Quadrature Formulae.', 'Numerical Methods for Scientific Computing by J.H. Heinbockel Trafford Publishing USA, 2006');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'EC-431', 'Software Project Management', 3, 'Elective', 'CS Elective', 7, 'Software Project Management, Bob Hughes and Mike Cotterell, McGraw-Hill Education; 5th Edition (2009).', 'Introduction to Software Project Management, Project Management concepts, Project Management Tools, PMI‘s Knowledge areas, PMI Framework, PMI Process Groups. Understanding Organizations. Project Planning, Project Evaluation, Selection of an Appropriate Approach in Project, Software Effort Estimation, Activity Planning, Risk Management, Evaluating the Risks to the Schedule, Risk Control, Configuration Management and Maintenance, Environment for Configuration Control, Resource Allocation, Monitoring & Control, Review and Evaluation, Challenges of Outsourcing in Project Management', 'A Guide to the Project Management Body of Knowledge, 5th Edition (PMBOK Guides), Mastering Software Project Management: Best Practices, Tools and Techniques, Murali K. Chemuturi and Thomas M. Cagley Jr., J. Ross Publishing, 2010 Effective Project Management: Traditional, Agile, Extreme, Robert K. Wysocki, Wiley; 6th Edition, 2011');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'EC-432', 'Software Quality Assurance', 3, 'Elective', 'CS Elective', 7, 'Paul Jorgensen, Software Testing, A Craftsman''s Approach, 4th Ed. CRC Press, Taylor and Francis Group, 2015', 'Software Quality, Software Quality Attributes, Quality Engineering., Testing: Concepts, Issues, and Techniques, Software testing lifecycle., Testing Scopes., Testing Approaches., Testing Concepts., Test Planning Process, Introduction to testing process, Requirement of software test planning, Testing documentation, Reporting and historical data recording., Software testing techniques, Testing philosophies , Testing strategies, Model based testing, Software testing techniques, Testing using models, Domain and combinatorial testing, Unit and integration testing, Acceptance testing, Test automation, Slicing, Software reliability models and engineering, Introduction, Exponential model., Reliability growth models, Modeling process, Software inspections, Software reviews, Inspection checks and metrics, Quality Models, Models for quality assessment, Product quality metrics, Quality Measurements, In-Process metrics for software testing, In-Process quality management, Effort/outcome models, System testing, Introduction to sub-system testing, From functional to system aspects of testing, System testing, Introduction to system testing, Scenarios development, System testing, Use-cases for testing, Specification-based testing, Open issues on software testing', 'Bernard Homes, Fundamentals of Software Testing, ISTE, Wiley, 2012 Software Engineering, “Ian Sommerville, 9th Edition, Addison Wesley, 2011');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'CC-411', 'Final Year Project - I', 3, 'Capstone Project', 'Computing Core', 7, NULL, NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'GE-461', 'Technical & Business Writing', 3, 'General Education', 'General Education', 7, 'Technical Report Writing, by Pauley and Riordan, Houghton Mifflin Company, 8th Edition.', 'Overview of technical reporting, use of library and information gathering, administering questionnaires, reviewing the gathered information; Technical exposition; topical arrangement, exemplification, definition, classification and division, casual analysis, effective exposition, technical narration, description and argumentation, persuasive strategy, Organizing information and generation solution: brainstorming, organizing material, construction of the formal outline, outlining conventions, electronic communication, generation solutions. Polishing style: paragraphs, listening sentence structure, clarity, length and order, pomposity, empty words, pompous vocabulary, document design: document structure, preamble, summaries, abstracts, table of contents, footnotes, glossaries, cross-referencing, plagiarism, citation and bibliography, glossaries, index, appendices, typesetting systems, creating the professional report; elements, mechanical elements and graphical elements. Reports: Proposals, progress reports, Leaflets, brochures, handbooks, magazines articles, research papers, feasibility reports, project reports, technical research reports, manuals and documentation, thesis. Electronic documents, Linear verses hierarchical structure documents.', 'Effective Technical Communication by Ashraf Rizvi, Tata McGraw-Hill.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'CC-412', 'Final Year Project - II', 3, 'Capstone Project', 'Computing Core', 8, NULL, NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'UE-472', 'Principles of Management', 3, 'Elective', 'University Elective', 8, NULL, NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'UE-471', 'Arabic Language', 2, 'Elective', 'University Elective', 8, '"ناسللا یبرعلا"', 'مسلاا ، ،لعفلا ،فرحلا رئامضلا ،ہلصتم بکرملا ،ىفاضلاا بکرملا ،یفیصوتلا رئامضلا ،ۃلصفنملا فورح ،رجلا ہلمجلا ،ۃیمسلاا ۃلمجلا ،ہیلعفلا رکذملا ،ثنوملاو دحاولا ،عمجلا لعفلا ،يضاملا لعفلا ،عراضملا لعفلا ،فعضملا رئامضلا ،لاعفلاابۃلصتملا لعفلا ،حیحصلا لعفلا ،لتعملا ثیداحلأا ،ۃیوبنلا دیشانلاا ،ۃراتخملا فورح،صصقلا ،اجهلا جراخملا ،فورحلا ےلہپ ےراپیس اک ہمجرت عم ظافلا یک حیرشت ظاحلب دعاوق', '1. یبرع اک ملعم ، ہصح ،لوا مود 2. لیهست فرصلا 3. لیهست وحنلا 4. ۃارقلا ہدشارلا 5. ۃارقلا ہدیشرلا');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'CC-413', 'Information Security', 3, 'Core', 'Computing Core', 8, 'M. Whitman and H. Mattord, Principles of Information Security, 6th edition.', 'Information security foundations, security design principles; security mechanisms, symmetric and asymmetric cryptography, encryption, hash functions, digital signatures, key management, authentication, and access control; software security, vulnerabilities and protections, malware, database security; network security, firewalls, intrusion detection; security policies, policy formation, and enforcement, risk assessment, cybercrime, law and ethics in information security, privacy and anonymity of data.', 'William Stallings, Computer Security: Principles and Practice, 3rd edition. Dieter Gollmann, Computer Security, 3rd edition. William Easttom, Computer Security Fundamentals, 3rd edition.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'SC-441', 'Theory of Programming Languages', 3, 'Core', 'CS Supporting', 8, 'Concepts of Programming Languages, Robert W. Sebesta, 10th edition, 2012', 'Introduction: Models of Computation, Syntax and Semantics, Pragmatics, Language Design Principles. Syntax and Semantics: Context-Free Grammars, Regular Expressions, Attribute Grammars and Static Semantics, Algebraic Semantics, Axiomatic Semantics, Denotational Semantics. BNF grammars and Syntax, Operational Equivalence, Abstraction and Generalization, Expressions, Assignment Statement, and Control Structures, Functional Programming: The Lambda Calculus, Operational Semantics, Reduction Order, Recursive Functions, Logic Programming, Inference Engine, Concurrency.', 'Scott, Michael L., Programming Language Pragmatics, 2nd edition, 2006 Theory Introduction to Programming Languages, by Anthony A. Aaby, 2004 Principles of Programming Languages by Mike Grant Zachary Palmer Scott Smith, John Hopkins University 2016.');
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", textbook, "catalogDescription", "referenceMaterial") VALUES (gen_random_uuid()::text, cid, 'UE-473', 'Social Service', 1, 'Elective', 'University Elective', 8, 'Khalid, Muhammad. Social Work: Theory & Practice. Karachi: Kifayat Academy, 2020. ISBN-13: 978-969859719-1.', 'The objective of this course is to acquaint and familiarize students with the basic concepts and, the scope of Social work. Social Service: Philosophical base, generic principles, Islamic concept, policy, primary and secondary methods, professional and voluntary. Important fields of practice include health, education, poverty, minorities, etc. Social Institutions: Structure and types including family, religious, political, educational, economic, recreational, non- governmental organizations (NGOs), etc. Social Problems: Impact on development, the role of a social worker. Types of social problems include crime, overpopulation, juvenile delinquency, illiteracy, poverty, social inequality, beggary, unemployment and underemployment, child labor, addiction, gender-based violence, corruption, terrorism, urbanization, etc. Social Welfare in Pakistan: Development of social welfare, social legislation, services, and welfare initiatives for family, children, youth, labor, women, senior citizens, and disabled persons. National & regional organizations including All Pakistan Women Association (APWA), Edhi Foundation, Ansaar Burni Trust, Akhuwat, Rural Support Program (NRSP, AKRSP, PRSP, SRSP, BRSP), Orangi Pilot Project (OPP). Global Social Services: Global social problems include human trafficking, illegal drug sales, and abuse, environmental disasters, racial inequalities, inter-ethnic strife, immigrant and migration rights. International organizations including United Nations International Children Emergency Fund (UNICEF), International Labor Organization (ILO), World Health Organization (WHO), United Nations Education, Scientific & Cultural Organization (UNESCO), United Nations High Commissioner for Refugee (UNHCR), United Nations Development Program (UNDP), World Food Program, Red Crescent. ICT for Social Work: Organizing people and ideas, sharing of norms and values, transparency and access to public information, greater access to knowledge and education, efficient collaborations, global village, etc.', 'Rehmatullah, S. (2003). Social Welfare in Pakistan. Oxford University Press. ISBN-13: 978-019579632-2. Kirst‐Ashman, K. (2012). Introduction to Social Work & Social Welfare: Critical Thinking Perspectives, 4th ed. Brooks/Cole. ISBN‐13: 978‐084002866-2.');
    UPDATE "MasterCourse" SET "prerequisiteCourseId" = (SELECT id FROM "MasterCourse" WHERE "masterCurriculumId"=cid AND code='MS-151') WHERE "masterCurriculumId"=cid AND code='DC-121';
    UPDATE "MasterCourse" SET "prerequisiteCourseId" = (SELECT id FROM "MasterCourse" WHERE "masterCurriculumId"=cid AND code='MS-151') WHERE "masterCurriculumId"=cid AND code='DC-121L';
    UPDATE "MasterCourse" SET "prerequisiteCourseId" = (SELECT id FROM "MasterCourse" WHERE "masterCurriculumId"=cid AND code='GE-162') WHERE "masterCurriculumId"=cid AND code='GE-164';
    UPDATE "MasterCourse" SET "prerequisiteCourseId" = (SELECT id FROM "MasterCourse" WHERE "masterCurriculumId"=cid AND code='CC-112') WHERE "masterCurriculumId"=cid AND code='CC-211';
    UPDATE "MasterCourse" SET "prerequisiteCourseId" = (SELECT id FROM "MasterCourse" WHERE "masterCurriculumId"=cid AND code='CC-112') WHERE "masterCurriculumId"=cid AND code='CC-211L';
    UPDATE "MasterCourse" SET "prerequisiteCourseId" = (SELECT id FROM "MasterCourse" WHERE "masterCurriculumId"=cid AND code='MS-251') WHERE "masterCurriculumId"=cid AND code='SC-241';
    UPDATE "MasterCourse" SET "prerequisiteCourseId" = (SELECT id FROM "MasterCourse" WHERE "masterCurriculumId"=cid AND code='CC-211') WHERE "masterCurriculumId"=cid AND code='CC-213';
    UPDATE "MasterCourse" SET "prerequisiteCourseId" = (SELECT id FROM "MasterCourse" WHERE "masterCurriculumId"=cid AND code='CC-211') WHERE "masterCurriculumId"=cid AND code='CC-213L';
    UPDATE "MasterCourse" SET "prerequisiteCourseId" = (SELECT id FROM "MasterCourse" WHERE "masterCurriculumId"=cid AND code='CC-213') WHERE "masterCurriculumId"=cid AND code='CC-311';
    UPDATE "MasterCourse" SET "prerequisiteCourseId" = (SELECT id FROM "MasterCourse" WHERE "masterCurriculumId"=cid AND code='CC-213') WHERE "masterCurriculumId"=cid AND code='CC-311L';
    UPDATE "MasterCourse" SET "prerequisiteCourseId" = (SELECT id FROM "MasterCourse" WHERE "masterCurriculumId"=cid AND code='CC-213') WHERE "masterCurriculumId"=cid AND code='DC-321';
    UPDATE "MasterCourse" SET "prerequisiteCourseId" = (SELECT id FROM "MasterCourse" WHERE "masterCurriculumId"=cid AND code='DC-222') WHERE "masterCurriculumId"=cid AND code='DC-322';
    UPDATE "MasterCourse" SET "prerequisiteCourseId" = (SELECT id FROM "MasterCourse" WHERE "masterCurriculumId"=cid AND code='CC-213') WHERE "masterCurriculumId"=cid AND code='CC-312';
    UPDATE "MasterCourse" SET "prerequisiteCourseId" = (SELECT id FROM "MasterCourse" WHERE "masterCurriculumId"=cid AND code='CC-213') WHERE "masterCurriculumId"=cid AND code='CC-312L';
    UPDATE "MasterCourse" SET "prerequisiteCourseId" = (SELECT id FROM "MasterCourse" WHERE "masterCurriculumId"=cid AND code='CC-112') WHERE "masterCurriculumId"=cid AND code='EC-331';
    UPDATE "MasterCourse" SET "prerequisiteCourseId" = (SELECT id FROM "MasterCourse" WHERE "masterCurriculumId"=cid AND code='CC-112') WHERE "masterCurriculumId"=cid AND code='EC-331L';
    UPDATE "MasterCourse" SET "prerequisiteCourseId" = (SELECT id FROM "MasterCourse" WHERE "masterCurriculumId"=cid AND code='CC-311') WHERE "masterCurriculumId"=cid AND code='DC-323';
    UPDATE "MasterCourse" SET "prerequisiteCourseId" = (SELECT id FROM "MasterCourse" WHERE "masterCurriculumId"=cid AND code='CC-111') WHERE "masterCurriculumId"=cid AND code='DC-324';
    UPDATE "MasterCourse" SET "prerequisiteCourseId" = (SELECT id FROM "MasterCourse" WHERE "masterCurriculumId"=cid AND code='CC-111') WHERE "masterCurriculumId"=cid AND code='DC-324L';
    UPDATE "MasterCourse" SET "prerequisiteCourseId" = (SELECT id FROM "MasterCourse" WHERE "masterCurriculumId"=cid AND code='MS-251') WHERE "masterCurriculumId"=cid AND code='SC-442';
    UPDATE "MasterCourse" SET "prerequisiteCourseId" = (SELECT id FROM "MasterCourse" WHERE "masterCurriculumId"=cid AND code='CC-212') WHERE "masterCurriculumId"=cid AND code='EC-431';
    UPDATE "MasterCourse" SET "prerequisiteCourseId" = (SELECT id FROM "MasterCourse" WHERE "masterCurriculumId"=cid AND code='CC-212') WHERE "masterCurriculumId"=cid AND code='EC-432';
    UPDATE "MasterCourse" SET "prerequisiteCourseId" = (SELECT id FROM "MasterCourse" WHERE "masterCurriculumId"=cid AND code='CC-112') WHERE "masterCurriculumId"=cid AND code='SC-441';
  END IF;
END $$;
-- Super User assigns official master curricula to institutes (Chairmen).
CREATE TABLE IF NOT EXISTS "CurriculumAssignment" (
  "id" TEXT PRIMARY KEY,
  "curriculumId" TEXT NOT NULL REFERENCES "MasterCurriculum"("id") ON DELETE CASCADE,
  "chairmanId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "CurriculumAssignment_curriculumId_chairmanId_key" ON "CurriculumAssignment"("curriculumId", "chairmanId");
CREATE INDEX IF NOT EXISTS "CurriculumAssignment_chairmanId_idx" ON "CurriculumAssignment"("chairmanId");

-- Keep today's behaviour for what institutes already have: every existing official curriculum
-- is assigned to every existing Chairman. The newly added prospectus / Punjab University
-- curricula are deliberately NOT auto-assigned - the Super User assigns those.
INSERT INTO "CurriculumAssignment" ("id", "curriculumId", "chairmanId")
SELECT gen_random_uuid()::text, mc."id", u."id"
FROM "MasterCurriculum" mc CROSS JOIN "User" u
WHERE mc."chairmanId" IS NULL AND mc."parentCurriculumId" IS NULL
  AND u."role" = 'CHAIRMAN'
  AND mc."authority" NOT IN ('Prospectus 2024-25', 'University of the Punjab')
ON CONFLICT DO NOTHING;
-- Departments, heads of department, visiting-faculty placeholder, subject-home tag. Safe to re-run.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'HEAD_OF_DEPARTMENT';
CREATE TABLE IF NOT EXISTS "Department" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "Department_chairmanId_name_key" ON "Department"("chairmanId", "name");
CREATE INDEX IF NOT EXISTS "Department_chairmanId_idx" ON "Department"("chairmanId");

CREATE TABLE IF NOT EXISTS "DepartmentProgram" (
  "id" TEXT PRIMARY KEY,
  "departmentId" TEXT NOT NULL REFERENCES "Department"("id") ON DELETE CASCADE,
  "chairmanId" TEXT NOT NULL,
  "degreeProgram" TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "DepartmentProgram_chairmanId_degreeProgram_key" ON "DepartmentProgram"("chairmanId", "degreeProgram");
CREATE INDEX IF NOT EXISTS "DepartmentProgram_departmentId_idx" ON "DepartmentProgram"("departmentId");

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "departmentId" TEXT REFERENCES "Department"("id") ON DELETE SET NULL;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isVisitingPlaceholder" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "subjectHomeDepartmentId" TEXT REFERENCES "Department"("id") ON DELETE SET NULL;

-- Everything that exists today moves into one default department per institute, so nothing breaks.
INSERT INTO "Department" ("id", "chairmanId", "name")
SELECT gen_random_uuid()::text, u."id", 'Main Department' FROM "User" u WHERE u."role" = 'CHAIRMAN'
ON CONFLICT DO NOTHING;

-- Coordinators, course assigners and OMC members (managed directly by the chairman)
UPDATE "User" x SET "departmentId" = d."id"
FROM "Department" d WHERE d."chairmanId" = x."managedById" AND d."name" = 'Main Department'
  AND x."role" IN ('PROGRAM_COORDINATOR', 'COURSE_ASSIGNER', 'OMC') AND x."departmentId" IS NULL;

-- Faculty (managed by a coordinator)
UPDATE "User" f SET "departmentId" = c."departmentId"
FROM "User" c WHERE f."managedById" = c."id" AND c."role" = 'PROGRAM_COORDINATOR'
  AND f."role" IN ('INSTRUCTOR', 'SUBJECT_EXPERT') AND f."departmentId" IS NULL;

-- Every degree program currently in use goes to the default department
INSERT INTO "DepartmentProgram" ("id", "departmentId", "chairmanId", "degreeProgram")
SELECT DISTINCT ON (c."managedById", b."degreeProgram") gen_random_uuid()::text, d."id", c."managedById", b."degreeProgram"
FROM "Batch" b JOIN "User" c ON c."id" = b."coordinatorId"
JOIN "Department" d ON d."chairmanId" = c."managedById" AND d."name" = 'Main Department'
WHERE c."role" = 'PROGRAM_COORDINATOR'
ON CONFLICT DO NOTHING;
