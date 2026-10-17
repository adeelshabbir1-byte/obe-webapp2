-- "Teach as one": sections of the same course taught by one teacher follow a main section's plan. Safe to re-run.
CREATE TABLE IF NOT EXISTS "SectionLink" ("courseId" TEXT PRIMARY KEY, "masterId" TEXT NOT NULL, "linkedById" TEXT NOT NULL, "lastSyncedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "SectionLink_masterId_idx" ON "SectionLink" ("masterId");
SELECT 'done' AS result;
