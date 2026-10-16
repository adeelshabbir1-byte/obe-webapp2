-- ============================================================================
-- NBEAC Self-Assessment Report (SAR 4.0) data: the institute / business-school
-- profile and the accreditation records register (policies, statutory bodies,
-- audits, admissions figures, counselling, research, MOUs, finance details,
-- confidential cases, ...), plus small additions to existing tables: program
-- level and approvals with the PEO-PLO map, course flags and teaching methods,
-- per-session teaching method and materials, student status, faculty CNIC /
-- specialization / affiliation, publication category and authorship, society
-- kind and membership, employer scope, and the FYP proposal's societal issue.
--
-- Run in Supabase's SQL Editor AFTER migration_master_spec.sql. Safe to run more
-- than once; it only adds tables and columns (every existing student starts as
-- ACTIVE). Generated from prisma/schema.prisma.
-- ============================================================================

-- AlterTable
ALTER TABLE "Employer" ADD COLUMN IF NOT EXISTS "scope" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN IF NOT EXISTS "statusDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "statusReason" TEXT;

-- AlterTable
ALTER TABLE "ProgramProfile" ADD COLUMN IF NOT EXISTS "academicCouncilDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "hecNocDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "launchDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "peoPloJson" TEXT,
ADD COLUMN IF NOT EXISTS "programLevel" TEXT;

-- AlterTable
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "corporateRelevance" TEXT,
ADD COLUMN IF NOT EXISTS "indigenousFocus" TEXT,
ADD COLUMN IF NOT EXISTS "teachingMethods" TEXT;

-- AlterTable
ALTER TABLE "LectureRow" ADD COLUMN IF NOT EXISTS "teachingMaterials" TEXT,
ADD COLUMN IF NOT EXISTS "teachingMethod" TEXT;

-- AlterTable
ALTER TABLE "FacultyProfile" ADD COLUMN IF NOT EXISTS "affiliation" TEXT,
ADD COLUMN IF NOT EXISTS "cnic" TEXT,
ADD COLUMN IF NOT EXISTS "specialization" TEXT;

-- AlterTable
ALTER TABLE "FacultyRecord" ADD COLUMN IF NOT EXISTS "authorship" TEXT,
ADD COLUMN IF NOT EXISTS "category" TEXT,
ADD COLUMN IF NOT EXISTS "citations" INTEGER;

-- AlterTable
ALTER TABLE "StudentSociety" ADD COLUMN IF NOT EXISTS "constitutedOn" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "memberCount" INTEGER,
ADD COLUMN IF NOT EXISTS "societyType" TEXT;

-- AlterTable
ALTER TABLE "FypProposal" ADD COLUMN IF NOT EXISTS "societalIssue" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "SarProfile" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "dataJson" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SarProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AccreditationRecord" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "departmentId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "recordDate" TIMESTAMP(3),
    "year" TEXT,
    "dataJson" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileData" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccreditationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SarProfile_chairmanId_scopeKey_key" ON "SarProfile"("chairmanId", "scopeKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AccreditationRecord_chairmanId_kind_idx" ON "AccreditationRecord"("chairmanId", "kind");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AccreditationRecord_departmentId_idx" ON "AccreditationRecord"("departmentId");

