-- OMC's limits on assessment types (course total or per CLO) and the OMC / HOD approvals of courses outside them.
-- Safe to run more than once.
CREATE TABLE IF NOT EXISTS "AssessmentRule" (
  "id" TEXT NOT NULL, "chairmanId" TEXT NOT NULL, "label" TEXT NOT NULL, "typesJson" TEXT NOT NULL DEFAULT '[]',
  "level" TEXT NOT NULL DEFAULT 'COURSE', "minPct" DOUBLE PRECISION, "maxPct" DOUBLE PRECISION,
  "courseKind" TEXT NOT NULL DEFAULT 'ALL', "program" TEXT, "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssessmentRule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AssessmentRule_chairmanId_idx" ON "AssessmentRule"("chairmanId");
CREATE TABLE IF NOT EXISTS "AssessmentRuleApproval" (
  "id" TEXT NOT NULL, "courseId" TEXT NOT NULL, "source" TEXT NOT NULL, "ruleId" TEXT NOT NULL, "scope" TEXT NOT NULL,
  "value" DOUBLE PRECISION NOT NULL, "status" TEXT NOT NULL, "note" TEXT, "decidedById" TEXT, "decidedByName" TEXT,
  "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssessmentRuleApproval_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AssessmentRuleApproval_courseId_idx" ON "AssessmentRuleApproval"("courseId");
