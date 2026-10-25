-- OMC rules (Prompt 4 item 8): assessment limits per course category set through rounds of members' opinions and locked by
-- the Convener, and OMC votes on requests made during the semester (two approvals, or 2 of 3 of a course's panel). Safe to run more than once.
CREATE TABLE IF NOT EXISTS "AssessmentLimitRound" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'OPEN', "categoriesJson" TEXT NOT NULL DEFAULT '[]',
  "openedById" TEXT NOT NULL, "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "closedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "AssessmentLimitRound_chairmanId_idx" ON "AssessmentLimitRound"("chairmanId");
CREATE TABLE IF NOT EXISTS "AssessmentLimitOpinion" (
  "roundId" TEXT NOT NULL, "memberId" TEXT NOT NULL, "category" TEXT NOT NULL, "figuresJson" TEXT NOT NULL, "comment" TEXT,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY ("roundId", "memberId", "category")
);
CREATE TABLE IF NOT EXISTS "AssessmentLimit" (
  "chairmanId" TEXT NOT NULL, "category" TEXT NOT NULL, "figuresJson" TEXT NOT NULL, "locked" BOOLEAN NOT NULL DEFAULT true,
  "lockedAt" TIMESTAMP(3), "lockedById" TEXT, "roundId" TEXT, "historyJson" TEXT NOT NULL DEFAULT '[]', PRIMARY KEY ("chairmanId", "category")
);
CREATE TABLE IF NOT EXISTS "OmcRequestVote" (
  "kind" TEXT NOT NULL, "requestId" TEXT NOT NULL, "memberId" TEXT NOT NULL, "approve" BOOLEAN NOT NULL, "reason" TEXT,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY ("kind", "requestId", "memberId")
);
CREATE TABLE IF NOT EXISTS "OmcPanel" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "departmentId" TEXT, "term" TEXT NOT NULL, "label" TEXT NOT NULL DEFAULT '',
  "courseIdsJson" TEXT NOT NULL DEFAULT '[]', "memberIdsJson" TEXT NOT NULL DEFAULT '[]', "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "OmcPanel_chairmanId_idx" ON "OmcPanel"("chairmanId", "term");
