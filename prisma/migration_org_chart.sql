-- Organisation chart (hierarchy view) and its history. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "OrgPosition" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "parentId" TEXT,
  "title" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'NONE',
  "facultyId" TEXT,
  "departmentId" TEXT,
  "program" TEXT,
  "holderId" TEXT,
  "coversJson" TEXT NOT NULL DEFAULT '[]',
  "orderIndex" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "OrgPosition_chairmanId_idx" ON "OrgPosition" ("chairmanId");
CREATE INDEX IF NOT EXISTS "OrgPosition_parentId_idx" ON "OrgPosition" ("parentId");
CREATE INDEX IF NOT EXISTS "OrgPosition_holderId_idx" ON "OrgPosition" ("holderId");
CREATE TABLE IF NOT EXISTS "OrgPositionLog" (
  "id" TEXT PRIMARY KEY,
  "positionId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "byId" TEXT NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "OrgPositionLog_positionId_idx" ON "OrgPositionLog" ("positionId");
SELECT 'done' AS result;
