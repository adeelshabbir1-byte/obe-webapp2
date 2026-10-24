-- Curriculum Builder: the course types of a curriculum (its own categories with targets), elective tracks, the
-- builders' scopes, and course-code schemes per department.
CREATE TABLE IF NOT EXISTS "CurriculumType" (
  "id" TEXT PRIMARY KEY,
  "curriculumId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'CORE',
  "minCourses" INTEGER,
  "minCredits" INTEGER,
  "maxCredits" INTEGER,
  "requiredJson" TEXT NOT NULL DEFAULT '[]',
  "note" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  "prefilled" BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS "CurriculumType_curriculumId_idx" ON "CurriculumType"("curriculumId");

CREATE TABLE IF NOT EXISTS "CurriculumTrack" (
  "id" TEXT PRIMARY KEY,
  "curriculumId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "minCourses" INTEGER,
  "position" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "CurriculumTrack_curriculumId_idx" ON "CurriculumTrack"("curriculumId");

CREATE TABLE IF NOT EXISTS "MasterCourseTrack" (
  "masterCourseId" TEXT NOT NULL,
  "trackId" TEXT NOT NULL,
  PRIMARY KEY ("masterCourseId","trackId")
);
CREATE INDEX IF NOT EXISTS "MasterCourseTrack_trackId_idx" ON "MasterCourseTrack"("trackId");

CREATE TABLE IF NOT EXISTS "CurriculumBuilderScope" (
  "userId" TEXT PRIMARY KEY,
  "councilsJson" TEXT NOT NULL DEFAULT '[]',
  "programsJson" TEXT NOT NULL DEFAULT '[]',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "CourseCodeScheme" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "program" TEXT,
  "prefix" TEXT NOT NULL,
  "digits" INTEGER NOT NULL DEFAULT 4,
  "effectiveTerm" TEXT,
  "effectiveYear" INTEGER,
  "setById" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CourseCodeScheme_chairmanId_idx" ON "CourseCodeScheme"("chairmanId");

-- A batch course's values when it was last in step with its master course (to tell "the master changed" from
-- "the Program Lead changed it").
CREATE TABLE IF NOT EXISTS "CourseMasterSync" (
  "courseId" TEXT PRIMARY KEY,
  "baseJson" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "CourseCodeScheme" ADD COLUMN IF NOT EXISTS "separator" TEXT NOT NULL DEFAULT '';

-- Theory / lab split of a master course's credit hours (e.g. 4 = 3 theory + 1 lab).
CREATE TABLE IF NOT EXISTS "MasterCourseLab" (
  "masterCourseId" TEXT PRIMARY KEY,
  "labCredits" INTEGER NOT NULL DEFAULT 0
);

-- Where a master course's CLOs / lecture plan were copied from (a same-named course of another curriculum).
CREATE TABLE IF NOT EXISTS "MasterCourseSource" (
  "masterCourseId" TEXT PRIMARY KEY,
  "fromCourseId" TEXT,
  "fromLabel" TEXT NOT NULL,
  "sameEdition" BOOLEAN NOT NULL DEFAULT true,
  "copiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
