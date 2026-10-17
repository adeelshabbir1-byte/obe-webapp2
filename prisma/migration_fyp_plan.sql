-- FYP year plan, open-house tasks and per-group project plans (Gantt). Safe to run more than once.
CREATE TABLE IF NOT EXISTS "FypPlanTask" (
  "id" TEXT PRIMARY KEY, "cycleId" TEXT NOT NULL, "groupId" TEXT, "title" TEXT NOT NULL, "category" TEXT NOT NULL DEFAULT 'GENERAL',
  "ownerId" TEXT, "ownerText" TEXT, "startDate" TIMESTAMP(3) NOT NULL, "endDate" TIMESTAMP(3) NOT NULL, "status" TEXT NOT NULL DEFAULT 'TODO',
  "orderIndex" INTEGER NOT NULL DEFAULT 0, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "FypPlanTask_cycleId_idx" ON "FypPlanTask" ("cycleId");
CREATE INDEX IF NOT EXISTS "FypPlanTask_groupId_idx" ON "FypPlanTask" ("groupId");
-- (added) working-day durations, dependencies and fixed starts; open house logistics.
ALTER TABLE "FypPlanTask" ADD COLUMN IF NOT EXISTS "durationDays" INTEGER;
ALTER TABLE "FypPlanTask" ADD COLUMN IF NOT EXISTS "dependsJson" TEXT;
ALTER TABLE "FypPlanTask" ADD COLUMN IF NOT EXISTS "fixedStart" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS "FypOpenHouseItem" (
  "id" TEXT PRIMARY KEY, "cycleId" TEXT NOT NULL, "kind" TEXT NOT NULL, "title" TEXT NOT NULL, "groupId" TEXT, "ownerId" TEXT, "ownerText" TEXT,
  "room" TEXT, "startAt" TIMESTAMP(3), "endAt" TIMESTAMP(3), "qty" INTEGER, "vendor" TEXT, "status" TEXT NOT NULL DEFAULT 'PLANNED', "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "FypOpenHouseItem_cycleId_idx" ON "FypOpenHouseItem" ("cycleId");
SELECT 'done' AS result;
