-- Guided batch set-up (Prompt 4 items 1-4, 6): the 13-step progress of each batch, courses whose semester the Program
-- Lead moved by hand (never moved again by sync), and where each synced course came from. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "BatchSetupProgress" (
  "batchId" TEXT PRIMARY KEY, "marksJson" TEXT NOT NULL DEFAULT '{}', "currentStep" INTEGER NOT NULL DEFAULT 1,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "BatchCourseManual" ("courseId" TEXT PRIMARY KEY, "batchId" TEXT NOT NULL, "byId" TEXT NOT NULL, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "BatchCourseManual_batchId_idx" ON "BatchCourseManual"("batchId");
CREATE TABLE IF NOT EXISTS "BatchCourseOrigin" (
  "courseId" TEXT PRIMARY KEY, "batchId" TEXT NOT NULL, "fromCourseId" TEXT NOT NULL, "fromBatchName" TEXT NOT NULL DEFAULT '',
  "semester" INTEGER, "curriculumSemester" INTEGER, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "BatchCourseOrigin_batchId_idx" ON "BatchCourseOrigin"("batchId");
