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

-- (migration_clo_plo_mapping.sql intentionally omitted: superseded by migration_institutional_plos.sql)
-- (one-off repair scripts: constraint fixes, orphaned-row cleanups — not needed for a fresh database)
