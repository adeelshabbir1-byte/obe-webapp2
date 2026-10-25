-- Batch set-up: tracks a batch offers, courses marked "new" (equal to nothing taught before), the program's chosen names
-- and codes for curriculum courses, and the log of courses added to / removed from a batch's scheme.
CREATE TABLE IF NOT EXISTS "BatchTrackOffer" ("batchId" TEXT NOT NULL, "trackId" TEXT NOT NULL, "name" TEXT NOT NULL DEFAULT '', PRIMARY KEY ("batchId", "trackId"));
CREATE TABLE IF NOT EXISTS "BatchCourseNew" ("courseId" TEXT PRIMARY KEY, "batchId" TEXT NOT NULL, "byId" TEXT NOT NULL, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "BatchCourseNew_batchId_idx" ON "BatchCourseNew"("batchId");
CREATE TABLE IF NOT EXISTS "ProgramCourseNaming" ("chairmanId" TEXT NOT NULL, "program" TEXT NOT NULL, "masterCourseId" TEXT NOT NULL, "code" TEXT NOT NULL, "title" TEXT NOT NULL, "byId" TEXT NOT NULL, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY ("chairmanId", "program", "masterCourseId"));
CREATE TABLE IF NOT EXISTS "BatchSchemeChange" ("id" TEXT PRIMARY KEY, "batchId" TEXT NOT NULL, "courseId" TEXT, "code" TEXT NOT NULL DEFAULT '', "title" TEXT NOT NULL DEFAULT '', "action" TEXT NOT NULL, "why" TEXT, "byId" TEXT NOT NULL, "byName" TEXT NOT NULL DEFAULT '', "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "BatchSchemeChange_batchId_idx" ON "BatchSchemeChange"("batchId");
