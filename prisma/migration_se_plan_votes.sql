-- Subject Expert plan step by step and OMC approval by vote (Prompt 4 items 6-7): the plan's state per course (steps done,
-- approval carried from the previous batch, recheck, OMC-finalised note), each member's vote per round, and the OMC's
-- suggestions with the Subject Expert's replies. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "SePlanState" (
  "courseId" TEXT PRIMARY KEY, "round" INTEGER NOT NULL DEFAULT 1, "stepsJson" TEXT NOT NULL DEFAULT '{}',
  "carriedFromCourseId" TEXT, "carriedFromBatch" TEXT, "carriedApprovedAt" TIMESTAMP(3), "carriedHash" TEXT, "recheckedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3), "approvedById" TEXT, "finalisedByOmc" BOOLEAN NOT NULL DEFAULT false, "overriddenJson" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "SePlanVote" (
  "courseId" TEXT NOT NULL, "round" INTEGER NOT NULL, "memberId" TEXT NOT NULL, "approve" BOOLEAN NOT NULL, "comment" TEXT,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY ("courseId", "round", "memberId")
);
CREATE TABLE IF NOT EXISTS "SePlanSuggestion" (
  "id" TEXT PRIMARY KEY, "courseId" TEXT NOT NULL, "round" INTEGER NOT NULL, "step" TEXT NOT NULL, "item" TEXT, "text" TEXT NOT NULL,
  "reason" TEXT NOT NULL, "byId" TEXT NOT NULL, "byName" TEXT NOT NULL DEFAULT '', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT 'OPEN', "reply" TEXT, "repliedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "SePlanSuggestion_courseId_idx" ON "SePlanSuggestion"("courseId");
