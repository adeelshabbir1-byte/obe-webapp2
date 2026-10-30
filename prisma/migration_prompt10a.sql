-- Prompt 10, build A: snapshots of a reset semester offering (restorable for 7 days), books' tables of contents for
-- mapping topics to chapters, and whether a topic's reading was filled in automatically. Side tables only; safe to run
-- more than once.
CREATE TABLE IF NOT EXISTS "SemesterReset" (
  "id" TEXT PRIMARY KEY, "scopeKey" TEXT NOT NULL, "label" TEXT NOT NULL, "byUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL,
  "restoredAt" TIMESTAMP(3), "restoredById" TEXT, "summaryJson" TEXT NOT NULL DEFAULT '{}', "dataJson" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "SemesterReset_scopeKey_idx" ON "SemesterReset"("scopeKey", "createdAt");

CREATE TABLE IF NOT EXISTS "BookToc" (
  "bookKey" TEXT PRIMARY KEY, "title" TEXT NOT NULL, "entriesJson" TEXT NOT NULL DEFAULT '[]', "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE IF EXISTS "TopicMeta" ADD COLUMN IF NOT EXISTS "readingAuto" BOOLEAN NOT NULL DEFAULT false;
