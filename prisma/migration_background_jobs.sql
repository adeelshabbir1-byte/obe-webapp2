-- Speed: a background job queue (lib/jobs.ts). Slow work the person does not need to wait for — email, SMS / WhatsApp,
-- phone pushes — runs after the response; the daily cron and /api/cron/jobs retry anything left. Safe to run twice.
CREATE TABLE IF NOT EXISTS "BackgroundJob" (
  "id" TEXT PRIMARY KEY,
  "kind" TEXT NOT NULL,
  "payloadJson" TEXT NOT NULL DEFAULT 'null',
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "doneAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "BackgroundJob_status_runAfter_idx" ON "BackgroundJob" ("status", "runAfter");
