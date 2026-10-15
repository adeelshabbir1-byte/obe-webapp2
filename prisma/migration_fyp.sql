-- ============================================================================
-- Final Year Projects (FYP): FYP Head and Committee, cycles, proposals, groups,
-- applications, milestones, rubric, panels (with external evaluators), scores,
-- results, extensions, requisitions, artifacts.
--
-- Run in Supabase's SQL Editor AFTER migration_oct2026_features.sql. Safe to run
-- more than once; it only adds tables. Generated from prisma/schema.prisma.
-- ============================================================================

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypStaff" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FypStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypCycle" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "termName" TEXT NOT NULL,
    "termYear" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "courseCode" TEXT NOT NULL DEFAULT 'FYP',
    "courseTitle" TEXT NOT NULL DEFAULT 'Final Year Project',
    "creditHours" INTEGER NOT NULL DEFAULT 6,
    "supervisorPct" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "internalPct" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "externalPct" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "minGroupSize" INTEGER NOT NULL DEFAULT 2,
    "maxGroupSize" INTEGER NOT NULL DEFAULT 4,
    "minCgpa" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "minCreditHours" INTEGER NOT NULL DEFAULT 95,
    "maxApplications" INTEGER NOT NULL DEFAULT 3,
    "cutoffsJson" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FypCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypMilestone" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "weightPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FypMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypRubricCriterion" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "bloomLevel" TEXT,
    "ploNumber" INTEGER,
    "maxScore" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "appliesTo" TEXT NOT NULL DEFAULT 'INDIVIDUAL',
    "orderIndex" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FypRubricCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypProposal" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "proposerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "domain" TEXT,
    "abstract" TEXT NOT NULL,
    "scope" TEXT,
    "skills" TEXT,
    "hardware" TEXT,
    "software" TEXT,
    "outcomes" TEXT,
    "ploNumbers" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "maxGroups" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FypProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypGroup" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leaderId" TEXT NOT NULL,
    "proposalId" TEXT,
    "supervisorId" TEXT,
    "panelId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'FORMING',
    "atRisk" BOOLEAN NOT NULL DEFAULT false,
    "riskNote" TEXT,
    "extendedUntil" TIMESTAMP(3),
    "publicationFlag" BOOLEAN NOT NULL DEFAULT false,
    "patentFlag" BOOLEAN NOT NULL DEFAULT false,
    "incubatorFlag" BOOLEAN NOT NULL DEFAULT false,
    "flagNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FypGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypGroupMember" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FypGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypApplication" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FypApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypPanel" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "venue" TEXT,
    "sessionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FypPanel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypPanelMember" (
    "id" TEXT NOT NULL,
    "panelId" TEXT NOT NULL,
    "userId" TEXT,
    "externalId" TEXT,
    "role" TEXT NOT NULL,

    CONSTRAINT "FypPanelMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypExternal" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "organization" TEXT,
    "designation" TEXT,
    "expertise" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FypExternal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypScore" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "evaluatorKey" TEXT NOT NULL,
    "evaluatorRole" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FypScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypEvaluation" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "evaluatorKey" TEXT NOT NULL,
    "evaluatorRole" TEXT NOT NULL,
    "evaluatorName" TEXT NOT NULL,
    "comments" TEXT,
    "recommendation" TEXT NOT NULL DEFAULT 'ON_TRACK',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FypEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypResult" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "totalPct" DOUBLE PRECISION NOT NULL,
    "grade" TEXT NOT NULL,
    "gpaPoints" DOUBLE PRECISION,
    "ploJson" TEXT NOT NULL,
    "breakdownJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONSOLIDATED',
    "note" TEXT,
    "consolidatedById" TEXT NOT NULL,
    "consolidatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "FypResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypExtension" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "previousDue" TIMESTAMP(3),
    "newDueDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "followUpAt" TIMESTAMP(3),
    "grantedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FypExtension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypRequisition" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "details" TEXT,
    "amount" DOUBLE PRECISION,
    "sponsor" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "requestedBy" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FypRequisition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypArtifact" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "similarityPct" DOUBLE PRECISION,
    "note" TEXT,
    "addedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FypArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypStaff_userId_idx" ON "FypStaff"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FypStaff_departmentId_userId_key" ON "FypStaff"("departmentId", "userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypCycle_departmentId_idx" ON "FypCycle"("departmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypMilestone_cycleId_idx" ON "FypMilestone"("cycleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypRubricCriterion_cycleId_idx" ON "FypRubricCriterion"("cycleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypProposal_cycleId_status_idx" ON "FypProposal"("cycleId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypProposal_proposerId_idx" ON "FypProposal"("proposerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypGroup_cycleId_idx" ON "FypGroup"("cycleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypGroup_supervisorId_idx" ON "FypGroup"("supervisorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypGroup_panelId_idx" ON "FypGroup"("panelId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypGroupMember_groupId_idx" ON "FypGroupMember"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FypGroupMember_cycleId_studentId_key" ON "FypGroupMember"("cycleId", "studentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypApplication_proposalId_status_idx" ON "FypApplication"("proposalId", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FypApplication_groupId_proposalId_key" ON "FypApplication"("groupId", "proposalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypPanel_cycleId_idx" ON "FypPanel"("cycleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypPanelMember_panelId_idx" ON "FypPanelMember"("panelId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypPanelMember_userId_idx" ON "FypPanelMember"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypPanelMember_externalId_idx" ON "FypPanelMember"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FypExternal_tokenHash_key" ON "FypExternal"("tokenHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypExternal_cycleId_idx" ON "FypExternal"("cycleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypScore_groupId_idx" ON "FypScore"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FypScore_milestoneId_criterionId_studentId_evaluatorKey_key" ON "FypScore"("milestoneId", "criterionId", "studentId", "evaluatorKey");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FypEvaluation_groupId_milestoneId_evaluatorKey_key" ON "FypEvaluation"("groupId", "milestoneId", "evaluatorKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypResult_groupId_idx" ON "FypResult"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FypResult_cycleId_studentId_key" ON "FypResult"("cycleId", "studentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypExtension_groupId_idx" ON "FypExtension"("groupId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypRequisition_groupId_idx" ON "FypRequisition"("groupId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypArtifact_groupId_idx" ON "FypArtifact"("groupId");

SELECT 'done' AS result;
