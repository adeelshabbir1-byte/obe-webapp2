-- ============================================================================
-- Course allocation inputs from faculty: how many times each teacher has taught
-- a course before, and their wish for the semester (number of sections and
-- remarks). Used by the Course Assigner's suggested allocation.
-- Safe to run more than once; it only adds tables.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "FacultyCourseExperience" (
  "id" TEXT NOT NULL,
  "facultyId" TEXT NOT NULL,
  "courseCode" TEXT NOT NULL,
  "timesTaught" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FacultyCourseExperience_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FacultyCourseExperience_facultyId_courseCode_key" ON "FacultyCourseExperience"("facultyId", "courseCode");

CREATE TABLE IF NOT EXISTS "FacultyAllocationWish" (
  "id" TEXT NOT NULL,
  "facultyId" TEXT NOT NULL,
  "maxSections" INTEGER,
  "remarks" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FacultyAllocationWish_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FacultyAllocationWish_facultyId_key" ON "FacultyAllocationWish"("facultyId");
