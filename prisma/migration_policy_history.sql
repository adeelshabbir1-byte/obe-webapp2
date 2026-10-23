-- Policy version history: each policy, manual and curriculum, and every version with its Board of Studies and Academic
-- Council meeting and minute numbers, approval and effective dates. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "PolicyDoc" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "kind" TEXT NOT NULL, "title" TEXT NOT NULL, "program" TEXT,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PolicyDoc_chairmanId_idx" ON "PolicyDoc" ("chairmanId");
CREATE TABLE IF NOT EXISTS "PolicyVersion" (
  "id" TEXT PRIMARY KEY, "docId" TEXT NOT NULL, "version" TEXT NOT NULL, "summary" TEXT,
  "bosMeeting" TEXT, "bosDate" TIMESTAMP(3), "bosMinute" TEXT, "acMeeting" TEXT, "acDate" TIMESTAMP(3), "acMinute" TEXT,
  "effectiveFrom" TIMESTAMP(3), "link" TEXT, "fileName" TEXT, "fileMime" TEXT, "fileData" TEXT,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PolicyVersion_docId_idx" ON "PolicyVersion" ("docId");
SELECT 'done' AS result;
