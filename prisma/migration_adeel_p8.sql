-- Adeel prompt part 8: the one-year allocation plan (drafts, submit, HOD approval), teachers' section / time picks,
-- HOD allocation rules, swap requests; prerequisite-topic remedies and the topic remedy bank. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "AllocationPlan" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "scopeKey" TEXT NOT NULL, "yearLabel" TEXT NOT NULL, "draft" TEXT NOT NULL DEFAULT 'A',
  "status" TEXT NOT NULL DEFAULT 'DRAFT', "rowsJson" TEXT NOT NULL DEFAULT '[]', "deadline" TIMESTAMP(3), "submittedById" TEXT, "submittedAt" TIMESTAMP(3),
  "approvedById" TEXT, "approvedAt" TIMESTAMP(3), "changesJson" TEXT NOT NULL DEFAULT '[]', "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "AllocationPlan_scope_year_draft" ON "AllocationPlan"("chairmanId", "scopeKey", "yearLabel", "draft");
CREATE TABLE IF NOT EXISTS "AllocPrefDetail" (
  "facultyId" TEXT NOT NULL, "courseCode" TEXT NOT NULL, "sections" TEXT, "times" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("facultyId", "courseCode")
);
CREATE TABLE IF NOT EXISTS "AllocRule" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "kind" TEXT NOT NULL, "facultyId" TEXT, "courseCode" TEXT, "n" INTEGER, "reason" TEXT,
  "byId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "AllocSwap" (
  "id" TEXT PRIMARY KEY, "planId" TEXT NOT NULL, "aId" TEXT NOT NULL, "aRow" TEXT NOT NULL, "bId" TEXT NOT NULL, "bRow" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ASKED', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "PrereqRemedy" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "courseId" TEXT NOT NULL, "instrumentId" TEXT NOT NULL, "prereqTopic" TEXT NOT NULL,
  "dependentCourseCode" TEXT NOT NULL, "dependentTopic" TEXT NOT NULL, "dependentLectureId" TEXT, "strength" TEXT NOT NULL, "avg" DOUBLE PRECISION NOT NULL,
  "belowPct" DOUBLE PRECISION NOT NULL, "cause" TEXT, "weakStudentsJson" TEXT NOT NULL DEFAULT '[]', "status" TEXT NOT NULL DEFAULT 'OPEN', "remedy" TEXT,
  "remedyNote" TEXT, "dueBy" TIMESTAMP(3), "chosenById" TEXT, "chosenAt" TIMESTAMP(3), "afterPct" DOUBLE PRECISION, "excusedById" TEXT, "excuseReason" TEXT,
  "notifiedNextAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PrereqRemedy_course_idx" ON "PrereqRemedy"("courseId");
CREATE TABLE IF NOT EXISTS "TopicRemedy" (
  "courseCode" TEXT NOT NULL, "topic" TEXT NOT NULL, "chairmanId" TEXT NOT NULL, "video" TEXT, "examples" TEXT, "practice" TEXT, "quiz" TEXT,
  "byId" TEXT NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY ("chairmanId", "courseCode", "topic")
);
