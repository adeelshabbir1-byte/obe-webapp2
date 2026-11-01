-- Part 5: official content (QR-I, QR-II, Discrete Structures) loaded into base courses, with a restorable version,
-- and system-generated duplicate master courses retired (hidden from pickers, kept in the history). Safe to run twice.
CREATE TABLE IF NOT EXISTS "OfficialContentLoad" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "sourceLabel" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "contentJson" TEXT NOT NULL,
  "beforeJson" TEXT NOT NULL DEFAULT '{}',
  "summary" TEXT NOT NULL DEFAULT '',
  "changeRequestId" TEXT,
  "byUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "appliedAt" TIMESTAMP(3),
  "undoneAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "OfficialContentLoad_courseId_idx" ON "OfficialContentLoad" ("courseId");
CREATE INDEX IF NOT EXISTS "OfficialContentLoad_chairmanId_idx" ON "OfficialContentLoad" ("chairmanId");

CREATE TABLE IF NOT EXISTS "MasterCourseRetired" (
  "masterCourseId" TEXT PRIMARY KEY,
  "replacedById" TEXT,
  "reason" TEXT NOT NULL DEFAULT '',
  "byUserId" TEXT,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
