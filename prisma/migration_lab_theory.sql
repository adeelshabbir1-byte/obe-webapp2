-- Lab under the theory instructor: per lab course, whether its marks go into the theory course's result (as one "Lab"
-- assessment, default 20%), the theory instructor's approval (which locks the lab marks for the Lab Engineer), and a
-- change request from the Lab Engineer after approval. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "LabTheorySetting" (
  "labCourseId" TEXT PRIMARY KEY,
  "theoryCourseId" TEXT,
  "intoTheory" BOOLEAN NOT NULL DEFAULT false,
  "weightPct" DOUBLE PRECISION NOT NULL DEFAULT 20,
  "instrumentId" TEXT,
  "oldWeightsJson" TEXT,
  "approvedAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "changeRequest" TEXT,
  "changeRequestedAt" TIMESTAMP(3),
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "LabTheorySetting_theoryCourseId_idx" ON "LabTheorySetting" ("theoryCourseId");
-- One reminder per lab session and day about a manual not yet approved.
CREATE TABLE IF NOT EXISTS "LabManualReminder" (
  "id" TEXT PRIMARY KEY,
  "labCourseId" TEXT NOT NULL,
  "labNumber" INTEGER NOT NULL,
  "sentOn" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "LabManualReminder_labCourseId_labNumber_sentOn_key" ON "LabManualReminder" ("labCourseId", "labNumber", "sentOn");
SELECT 'done' AS result;
