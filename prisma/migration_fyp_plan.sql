-- FYP year plan, open-house tasks and per-group project plans (Gantt). Safe to run more than once.
CREATE TABLE IF NOT EXISTS "FypPlanTask" (
  "id" TEXT PRIMARY KEY, "cycleId" TEXT NOT NULL, "groupId" TEXT, "title" TEXT NOT NULL, "category" TEXT NOT NULL DEFAULT 'GENERAL',
  "ownerId" TEXT, "ownerText" TEXT, "startDate" TIMESTAMP(3) NOT NULL, "endDate" TIMESTAMP(3) NOT NULL, "status" TEXT NOT NULL DEFAULT 'TODO',
  "orderIndex" INTEGER NOT NULL DEFAULT 0, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "FypPlanTask_cycleId_idx" ON "FypPlanTask" ("cycleId");
CREATE INDEX IF NOT EXISTS "FypPlanTask_groupId_idx" ON "FypPlanTask" ("groupId");
SELECT 'done' AS result;
