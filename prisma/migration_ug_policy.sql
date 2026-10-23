-- HEC Undergraduate Education Policy 2023 checker: which course of a program meets which named General Education
-- requirement (Islamic Studies, Quantitative Reasoning I & II, ICT, Civics …). Safe to run more than once.
CREATE TABLE IF NOT EXISTS "PolicyCourseMap" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "program" TEXT NOT NULL,
  "courseCode" TEXT NOT NULL,
  "requirement" TEXT NOT NULL,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "PolicyCourseMap_chairmanId_program_courseCode_key" ON "PolicyCourseMap" ("chairmanId", "program", "courseCode");
SELECT 'done' AS result;
