-- Part 3: Excel course-plan imports (each a version that can be undone, the file kept), the column mapping remembered per
-- institute, and the pilot's "Report a problem" (each report's page, browser and screenshot beside its System Feedback
-- row; the per-institute switch: everyone, chosen departments only, or off).
-- Side tables only; safe to run more than once.
CREATE TABLE IF NOT EXISTS "PlanImport" (
  "id" TEXT PRIMARY KEY, "courseId" TEXT NOT NULL, "source" TEXT NOT NULL, "byUserId" TEXT NOT NULL, "fileName" TEXT NOT NULL DEFAULT '',
  "fileRef" TEXT, "partsJson" TEXT NOT NULL DEFAULT '[]', "parsedJson" TEXT NOT NULL DEFAULT '{}', "beforeJson" TEXT NOT NULL DEFAULT '{}',
  "summary" TEXT NOT NULL DEFAULT '', "status" TEXT NOT NULL DEFAULT 'APPLIED', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "appliedAt" TIMESTAMP(3), "undoneAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "PlanImport_course_idx" ON "PlanImport"("courseId", "source");
CREATE TABLE IF NOT EXISTS "PlanImportMapping" (
  "chairmanId" TEXT PRIMARY KEY, "mappingJson" TEXT NOT NULL DEFAULT '{}', "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "ProblemReport" (
  "feedbackId" TEXT PRIMARY KEY, "chairmanId" TEXT, "userId" TEXT NOT NULL, "role" TEXT NOT NULL, "departmentId" TEXT, "kind" TEXT NOT NULL DEFAULT 'BUG',
  "pageUrl" TEXT NOT NULL DEFAULT '', "browser" TEXT, "screenshotRef" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ProblemReport_created_idx" ON "ProblemReport"("createdAt");
CREATE TABLE IF NOT EXISTS "ProblemPilot" (
  "chairmanId" TEXT PRIMARY KEY, "mode" TEXT NOT NULL DEFAULT 'ALL', "departmentIdsJson" TEXT NOT NULL DEFAULT '[]', "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
