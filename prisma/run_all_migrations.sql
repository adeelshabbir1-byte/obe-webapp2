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
CREATE UNIQUE INDEX IF NOT EXISTS "CLO_courseId_code_key" ON "CLO"("courseId", "code");
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
CREATE UNIQUE INDEX IF NOT EXISTS "LectureRow_courseId_lectureNumber_key" ON "LectureRow"("courseId", "lectureNumber");
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
CREATE UNIQUE INDEX IF NOT EXISTS "PLO_coordinatorId_number_key" ON "PLO"("coordinatorId", "number");
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

-- (migration_clo_plo_mapping.sql intentionally omitted: superseded by migration_institutional_plos.sql)
-- (the old Course_coordinatorId_code_key index fix and orphaned-course cleanup were one-off repairs, not needed for a fresh database)
