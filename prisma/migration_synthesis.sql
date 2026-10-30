-- Collaborative drafting and the hybrid synthesizer (parallel course proposals, the synthesized assessment split, a
-- log of each synthesis), and the justification an institute gives when its copy of an HEC Golden Copy is yellow.
-- Side tables only; safe to run more than once.
CREATE TABLE IF NOT EXISTS "CourseProposal" (
  "id" TEXT PRIMARY KEY, "masterCourseId" TEXT NOT NULL, "authorId" TEXT NOT NULL, "authorName" TEXT NOT NULL, "note" TEXT,
  "partsJson" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'SUBMITTED', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CourseProposal_course_idx" ON "CourseProposal"("masterCourseId");
CREATE TABLE IF NOT EXISTS "MasterCourseAssessment" ("masterCourseId" TEXT PRIMARY KEY, "itemsJson" TEXT NOT NULL DEFAULT '[]', "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS "CourseSynthesis" ("id" TEXT PRIMARY KEY, "masterCourseId" TEXT NOT NULL, "byId" TEXT NOT NULL, "picksJson" TEXT NOT NULL, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "CourseSynthesis_course_idx" ON "CourseSynthesis"("masterCourseId");
CREATE TABLE IF NOT EXISTS "CurriculumJustification" ("curriculumId" TEXT PRIMARY KEY, "text" TEXT NOT NULL, "byId" TEXT NOT NULL, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
