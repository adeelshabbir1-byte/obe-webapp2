-- Lab plan: lab tasks named before the semester and linked to the theory course's lecture topics, manual and solution files approved by the instructor, change alerts between instructor and Lab Engineer. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "LabTaskPlan" ("id" TEXT PRIMARY KEY, "labCourseId" TEXT NOT NULL, "labNumber" INTEGER NOT NULL, "week" INTEGER, "topicsJson" TEXT NOT NULL DEFAULT '[]', "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX IF NOT EXISTS "LabTaskPlan_labCourseId_labNumber_key" ON "LabTaskPlan" ("labCourseId", "labNumber");
CREATE TABLE IF NOT EXISTS "LabFileReview" ("id" TEXT PRIMARY KEY, "versionId" TEXT NOT NULL, "labCourseId" TEXT NOT NULL, "labNumber" INTEGER NOT NULL, "kind" TEXT NOT NULL DEFAULT 'MANUAL', "status" TEXT NOT NULL DEFAULT 'PENDING', "reviewedById" TEXT, "reviewedAt" TIMESTAMP(3), "note" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX IF NOT EXISTS "LabFileReview_versionId_key" ON "LabFileReview" ("versionId");
CREATE INDEX IF NOT EXISTS "LabFileReview_labCourseId_idx" ON "LabFileReview" ("labCourseId");
CREATE TABLE IF NOT EXISTS "LabSyncState" ("labCourseId" TEXT PRIMARY KEY, "lectureJson" TEXT NOT NULL DEFAULT '[]', "labJson" TEXT NOT NULL DEFAULT '[]', "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
SELECT 'done' AS result;
