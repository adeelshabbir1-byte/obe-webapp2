-- Indirect assessment: students' course-exit self-ratings per CLO, and each program's direct/indirect weighting. Safe to re-run.
CREATE TABLE IF NOT EXISTS "CourseExitResponse" ("id" TEXT PRIMARY KEY, "courseId" TEXT NOT NULL, "studentId" TEXT NOT NULL, "ratingsJson" TEXT NOT NULL, "comment" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX IF NOT EXISTS "CourseExitResponse_courseId_studentId_key" ON "CourseExitResponse" ("courseId", "studentId");
CREATE TABLE IF NOT EXISTS "IndirectConfig" ("coordinatorId" TEXT PRIMARY KEY, "weightsJson" TEXT NOT NULL, "target" DOUBLE PRECISION NOT NULL DEFAULT 60, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
SELECT 'done' AS result;
