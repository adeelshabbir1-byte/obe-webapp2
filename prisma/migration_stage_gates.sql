-- HEC stage-gates for national curricula: the degree's total credit hours, prerequisites marked "none", CLO→PLO
-- weights, the 16-week lab experiment plan, topic dependencies, and the category transition map used when a new
-- revision is seeded from an older one. Side tables only; safe to run more than once.
CREATE TABLE IF NOT EXISTS "CurriculumGateMeta" ("curriculumId" TEXT PRIMARY KEY, "totalCredits" INTEGER, "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS "MasterCourseGate" ("masterCourseId" TEXT PRIMARY KEY, "noPrereq" BOOLEAN NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS "MasterCloWeight" ("cloId" TEXT NOT NULL, "ploId" TEXT NOT NULL, "pct" DOUBLE PRECISION NOT NULL, PRIMARY KEY ("cloId", "ploId"));
CREATE TABLE IF NOT EXISTS "MasterLabPlan" ("masterCourseId" TEXT NOT NULL, "week" INTEGER NOT NULL, "experiment" TEXT NOT NULL, PRIMARY KEY ("masterCourseId", "week"));
CREATE TABLE IF NOT EXISTS "MasterTopicDep" (
  "id" TEXT PRIMARY KEY, "masterCourseId" TEXT NOT NULL, "lectureNumber" INTEGER NOT NULL, "onCourseId" TEXT NOT NULL, "onLecture" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "MasterTopicDep_course_idx" ON "MasterTopicDep"("masterCourseId");
CREATE TABLE IF NOT EXISTS "CategoryMap" ("curriculumId" TEXT NOT NULL, "fromName" TEXT NOT NULL, "toName" TEXT NOT NULL, PRIMARY KEY ("curriculumId", "fromName"));
