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

-- (migration_clo_plo_mapping.sql intentionally omitted: superseded by migration_institutional_plos.sql)
-- (one-off repair scripts: constraint fixes, orphaned-row cleanups — not needed for a fresh database)
