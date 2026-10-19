-- ============================================================================
-- Degree planner: loads per term, where each planned course came from (system,
-- student or advisor; term; batch), advisor requests and their approvals
-- (summer 12 h, course ahead of its semester, new course in summer), the
-- curriculum last seen per program (change alerts), the minimum class for an
-- extra section, and planned grades frozen at registration.
-- Safe to run more than once; it only adds tables.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "PlanLoad" (
  "id" TEXT NOT NULL, "studentId" TEXT NOT NULL, "loadsJson" TEXT NOT NULL DEFAULT '{}',
  "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlanLoad_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlanLoad_studentId_key" ON "PlanLoad"("studentId");

CREATE TABLE IF NOT EXISTS "PlanEntryMeta" (
  "id" TEXT NOT NULL, "studentId" TEXT NOT NULL, "courseId" TEXT NOT NULL,
  "termKey" TEXT, "batchLabel" TEXT, "source" TEXT NOT NULL DEFAULT 'SYSTEM', "summer" BOOLEAN NOT NULL DEFAULT false,
  "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlanEntryMeta_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlanEntryMeta_studentId_courseId_key" ON "PlanEntryMeta"("studentId", "courseId");

CREATE TABLE IF NOT EXISTS "PlanRequest" (
  "id" TEXT NOT NULL, "studentId" TEXT NOT NULL, "kind" TEXT NOT NULL,
  "courseCode" TEXT, "termKey" TEXT, "value" INTEGER, "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "requestedById" TEXT NOT NULL,
  "decidedById" TEXT, "decidedAt" TIMESTAMP(3), "decisionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlanRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PlanRequest_studentId_idx" ON "PlanRequest"("studentId");
CREATE INDEX IF NOT EXISTS "PlanRequest_status_idx" ON "PlanRequest"("status");

CREATE TABLE IF NOT EXISTS "CurriculumWatch" (
  "id" TEXT NOT NULL, "chairmanId" TEXT NOT NULL, "program" TEXT NOT NULL,
  "signatureJson" TEXT NOT NULL DEFAULT '{}', "batchId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CurriculumWatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CurriculumWatch_chairmanId_program_key" ON "CurriculumWatch"("chairmanId", "program");

CREATE TABLE IF NOT EXISTS "PlanSetting" (
  "id" TEXT NOT NULL, "chairmanId" TEXT NOT NULL, "minExtraClass" INTEGER NOT NULL DEFAULT 5,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlanSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlanSetting_chairmanId_key" ON "PlanSetting"("chairmanId");

CREATE TABLE IF NOT EXISTS "GradePlanSnapshot" (
  "id" TEXT NOT NULL, "studentId" TEXT NOT NULL, "courseCode" TEXT NOT NULL,
  "termName" TEXT NOT NULL, "termYear" INTEGER NOT NULL, "plannedGrade" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GradePlanSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "GradePlanSnapshot_studentId_idx" ON "GradePlanSnapshot"("studentId");
