-- OMC approval of a new batch (Prompt 4 item 5): the submission, the OMC's proposals with the Program Lead's opinion on
-- each, every member's endorsement, and the Convener's final decision (kept as accreditation evidence). Safe to run more than once.
CREATE TABLE IF NOT EXISTS "BatchApproval" (
  "batchId" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "departmentId" TEXT, "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "submittedById" TEXT NOT NULL, "reviewJson" TEXT NOT NULL DEFAULT '{}',
  "finalisedAt" TIMESTAMP(3), "finalisedById" TEXT, "summaryJson" TEXT
);
CREATE INDEX IF NOT EXISTS "BatchApproval_chairmanId_idx" ON "BatchApproval"("chairmanId", "status");
CREATE TABLE IF NOT EXISTS "BatchProposal" (
  "id" TEXT PRIMARY KEY, "batchId" TEXT NOT NULL, "step" TEXT NOT NULL, "courseId" TEXT, "kind" TEXT NOT NULL, "payloadJson" TEXT NOT NULL DEFAULT '{}',
  "reason" TEXT NOT NULL, "byId" TEXT NOT NULL, "byName" TEXT NOT NULL DEFAULT '', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "plOpinion" TEXT, "plComment" TEXT, "plAt" TIMESTAMP(3), "status" TEXT NOT NULL DEFAULT 'OPEN', "decidedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "BatchProposal_batchId_idx" ON "BatchProposal"("batchId");
CREATE TABLE IF NOT EXISTS "BatchEndorsement" (
  "batchId" TEXT NOT NULL, "memberId" TEXT NOT NULL, "endorse" BOOLEAN NOT NULL, "comment" TEXT, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("batchId", "memberId")
);
