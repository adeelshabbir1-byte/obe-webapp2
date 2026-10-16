-- Accreditation governance: each program bound to its council (NCEAC / NBEAC / HEC), the institute's thresholds per
-- council, accreditation visits with their delegated tasks, task evidence and history, and faculty profile verification.
-- Run in the Supabase SQL editor AFTER migration_qr_attendance.sql. Safe to run more than once.

-- AlterTable
ALTER TABLE "DepartmentProgram" ADD COLUMN IF NOT EXISTS "accreditationBody" TEXT,
ADD COLUMN IF NOT EXISTS "bodySetAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "bodySetById" TEXT;

-- AlterTable
ALTER TABLE "FacultyProfile" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "verifiedById" TEXT,
ADD COLUMN IF NOT EXISTS "verifiedNote" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AccreditationStandard" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "cloPassPct" INTEGER,
    "ploPassPct" INTEGER,
    "ploTargetPct" INTEGER,
    "maxStudentsPerComputer" DOUBLE PRECISION,
    "maxStudentFacultyRatio" INTEGER,
    "minFullTimeFaculty" INTEGER,
    "minPhdFaculty" INTEGER,
    "minCreditHours" INTEGER,
    "maxFacultyLoadCh" INTEGER,
    "maxClassSize" INTEGER,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccreditationStandard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AccreditationCycle" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "departmentId" TEXT,
    "leadId" TEXT NOT NULL,
    "program" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "visitDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccreditationCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AccreditationTask" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "assigneeId" TEXT,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "accessUntil" TIMESTAMP(3),
    "dataJson" TEXT NOT NULL DEFAULT '{}',
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccreditationTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AccreditationTaskFile" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccreditationTaskFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AccreditationTaskEvent" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "byId" TEXT NOT NULL,
    "toId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccreditationTaskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AccreditationStandard_chairmanId_body_key" ON "AccreditationStandard"("chairmanId", "body");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AccreditationCycle_chairmanId_status_idx" ON "AccreditationCycle"("chairmanId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AccreditationCycle_leadId_idx" ON "AccreditationCycle"("leadId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AccreditationTask_assigneeId_status_idx" ON "AccreditationTask"("assigneeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AccreditationTask_cycleId_code_key" ON "AccreditationTask"("cycleId", "code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AccreditationTaskFile_taskId_idx" ON "AccreditationTaskFile"("taskId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AccreditationTaskEvent_taskId_idx" ON "AccreditationTaskEvent"("taskId");
