-- Teacher's end-of-course review, internships & jobs, complex problems and the knowledge profile. Safe to re-run.
CREATE TABLE IF NOT EXISTS "CourseReview" ("courseId" TEXT PRIMARY KEY, "instructorId" TEXT NOT NULL, "perCloJson" TEXT NOT NULL DEFAULT '{}', "worked" TEXT, "challenges" TEXT, "changes" TEXT, "submittedAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS "Placement" ("id" TEXT PRIMARY KEY, "studentId" TEXT NOT NULL, "kind" TEXT NOT NULL, "organization" TEXT NOT NULL, "position" TEXT, "city" TEXT, "startDate" TIMESTAMP(3), "endDate" TIMESTAMP(3), "salaryBand" TEXT, "inField" BOOLEAN NOT NULL DEFAULT true, "supervisorEmail" TEXT, "verifiedById" TEXT, "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "Placement_studentId_idx" ON "Placement" ("studentId");
CREATE TABLE IF NOT EXISTS "ComplexTag" ("instrumentId" TEXT PRIMARY KEY, "courseId" TEXT NOT NULL, "attrsJson" TEXT NOT NULL DEFAULT '[]', "note" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "ComplexTag_courseId_idx" ON "ComplexTag" ("courseId");
CREATE TABLE IF NOT EXISTS "CourseKnowledge" ("id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "courseCode" TEXT NOT NULL, "areasJson" TEXT NOT NULL DEFAULT '[]', "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX IF NOT EXISTS "CourseKnowledge_chairmanId_courseCode_key" ON "CourseKnowledge" ("chairmanId", "courseCode");
SELECT 'done' AS result;
