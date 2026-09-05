-- Run in Supabase SQL Editor. Adds: the report ACL system, report bundles
-- (platform + coordinator scope), and program-level narrative content used
-- by the full program document generator.

CREATE TABLE IF NOT EXISTS "ReportAccessRule" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "chairmanId" TEXT NOT NULL REFERENCES "User"("id"),
  "reportId" TEXT NOT NULL,
  "subjectType" TEXT NOT NULL,
  "subjectValue" TEXT NOT NULL,
  "canView" BOOLEAN NOT NULL DEFAULT true,
  "canEdit" BOOLEAN NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS "ReportAccessRule_chairmanId_reportId_subjectType_subjectValue_key" ON "ReportAccessRule"("chairmanId", "reportId", "subjectType", "subjectValue");
CREATE INDEX IF NOT EXISTS "ReportAccessRule_chairmanId_idx" ON "ReportAccessRule"("chairmanId");

CREATE TABLE IF NOT EXISTS "ReportBundle" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "scope" TEXT NOT NULL,
  "ownerId" TEXT,
  "reportIds" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "ReportBundle_ownerId_idx" ON "ReportBundle"("ownerId");

CREATE TABLE IF NOT EXISTS "ProgramProfile" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "coordinatorId" TEXT NOT NULL REFERENCES "User"("id"),
  "degreeProgram" TEXT NOT NULL,
  "departmentIntro" TEXT,
  "departmentVision" TEXT,
  "departmentMission" TEXT,
  "peos" TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProgramProfile_coordinatorId_degreeProgram_key" ON "ProgramProfile"("coordinatorId", "degreeProgram");
