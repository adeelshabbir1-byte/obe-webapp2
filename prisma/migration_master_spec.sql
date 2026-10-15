-- ============================================================================
-- Prerequisite strengths (Strong / Mild / Weak) and review modules, remediation
-- (tutorials, junior-class sitting, micro-assessment, fees and instructor pay),
-- course tools, the shared textbook pool and library requisitions, society event
-- proposals and co-curricular engagement points, and topic-overlap judgements.
--
-- Run in Supabase's SQL Editor AFTER migration_fyp.sql. Safe to run more than
-- once; it only adds tables and columns (existing topic links become MILD,
-- existing society events stay APPROVED). Generated from prisma/schema.prisma.
-- ============================================================================

-- AlterTable
ALTER TABLE "TopicPrerequisite" ADD COLUMN IF NOT EXISTS "orphanedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "strength" TEXT NOT NULL DEFAULT 'MILD',
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "SocietyEvent" ADD COLUMN IF NOT EXISTS "budgetRequested" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "decidedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "decidedById" TEXT,
ADD COLUMN IF NOT EXISTS "decisionNote" TEXT,
ADD COLUMN IF NOT EXISTS "endTime" TEXT,
ADD COLUMN IF NOT EXISTS "equipment" TEXT,
ADD COLUMN IF NOT EXISTS "proposedByStudentId" TEXT,
ADD COLUMN IF NOT EXISTS "roomId" TEXT,
ADD COLUMN IF NOT EXISTS "startTime" TEXT,
ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'APPROVED';

-- CreateTable
CREATE TABLE IF NOT EXISTS "PrereqReviewPlan" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "lectureNumber" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "note" TEXT,
    "byId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrereqReviewPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RemediationPlan" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "coordinatorId" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "courseTitle" TEXT NOT NULL,
    "topics" TEXT[],
    "cloCodes" TEXT[],
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructorId" TEXT,
    "hostCourseId" TEXT,
    "lectureNumbers" INTEGER[],
    "schedule" TEXT,
    "startDate" TIMESTAMP(3),
    "feePerStudent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "instructorSharePct" DOUBLE PRECISION NOT NULL DEFAULT 70,
    "assessmentTitle" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "payoutAmount" DOUBLE PRECISION,
    "payoutAt" TIMESTAMP(3),
    "payoutById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RemediationPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RemediationEnrollment" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sourceCourseId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ENROLLED',
    "feeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "feeStatus" TEXT NOT NULL DEFAULT 'UNPAID',
    "receiptNo" TEXT,
    "paidAt" TIMESTAMP(3),
    "feeById" TEXT,
    "scorePct" DOUBLE PRECISION,
    "assessedAt" TIMESTAMP(3),
    "assessedById" TEXT,
    "beforeJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RemediationEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CourseTool" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "version" TEXT,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseTool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Textbook" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "authors" TEXT,
    "edition" TEXT,
    "publisher" TEXT,
    "year" INTEGER,
    "isbn" TEXT,
    "normKey" TEXT NOT NULL,
    "subjects" TEXT[],
    "fromHec" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Textbook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CourseTextbook" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "textbookId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'TEXT',
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseTextbook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "LibraryRequisition" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "textbookId" TEXT NOT NULL,
    "inStock" INTEGER NOT NULL DEFAULT 0,
    "ordered" INTEGER NOT NULL DEFAULT 0,
    "received" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryRequisition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "EngagementRecord" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "societyId" TEXT,
    "eventId" TEXT,
    "kind" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "term" TEXT,
    "note" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "awardedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngagementRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TopicOverlapReview" (
    "id" TEXT NOT NULL,
    "coordinatorId" TEXT NOT NULL,
    "codeA" TEXT NOT NULL,
    "codeB" TEXT NOT NULL,
    "topicKey" TEXT NOT NULL,
    "topicA" TEXT NOT NULL,
    "topicB" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "note" TEXT,
    "byId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopicOverlapReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PrereqReviewPlan_courseId_idx" ON "PrereqReviewPlan"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PrereqReviewPlan_linkId_courseId_key" ON "PrereqReviewPlan"("linkId", "courseId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RemediationPlan_chairmanId_status_idx" ON "RemediationPlan"("chairmanId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RemediationPlan_instructorId_idx" ON "RemediationPlan"("instructorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RemediationEnrollment_studentId_idx" ON "RemediationEnrollment"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RemediationEnrollment_planId_studentId_key" ON "RemediationEnrollment"("planId", "studentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CourseTool_courseId_idx" ON "CourseTool"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CourseTool_courseId_name_key" ON "CourseTool"("courseId", "name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Textbook_normKey_key" ON "Textbook"("normKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CourseTextbook_textbookId_idx" ON "CourseTextbook"("textbookId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CourseTextbook_courseId_textbookId_key" ON "CourseTextbook"("courseId", "textbookId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LibraryRequisition_chairmanId_term_textbookId_key" ON "LibraryRequisition"("chairmanId", "term", "textbookId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "EngagementRecord_dedupeKey_key" ON "EngagementRecord"("dedupeKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EngagementRecord_chairmanId_idx" ON "EngagementRecord"("chairmanId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EngagementRecord_studentId_idx" ON "EngagementRecord"("studentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EngagementRecord_eventId_idx" ON "EngagementRecord"("eventId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TopicOverlapReview_coordinatorId_idx" ON "TopicOverlapReview"("coordinatorId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TopicOverlapReview_coordinatorId_codeA_codeB_topicKey_key" ON "TopicOverlapReview"("coordinatorId", "codeA", "codeB", "topicKey");

