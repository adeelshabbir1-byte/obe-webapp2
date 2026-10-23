-- Recruitment (Prompt 2 item 7): request to hire with its approval chain, advertisement with an online application
-- form, eligibility and scores, the selection board's marks and recommendation, offer and joining. Safe to run twice.
CREATE TABLE IF NOT EXISTS "HiringRequest" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "departmentId" TEXT, "designation" TEXT NOT NULL, "area" TEXT NOT NULL, "positions" INTEGER NOT NULL DEFAULT 1,
  "justification" TEXT NOT NULL, "raisedById" TEXT NOT NULL, "stage" TEXT NOT NULL DEFAULT 'DEAN', "status" TEXT NOT NULL DEFAULT 'PENDING',
  "budgetNote" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "decidedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "HiringRequest_chairmanId_idx" ON "HiringRequest" ("chairmanId", "status");
CREATE TABLE IF NOT EXISTS "HiringApproval" (
  "id" TEXT PRIMARY KEY, "requestId" TEXT NOT NULL, "stage" TEXT NOT NULL, "byId" TEXT NOT NULL, "decision" TEXT NOT NULL, "note" TEXT, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "HiringApproval_requestId_idx" ON "HiringApproval" ("requestId");
CREATE TABLE IF NOT EXISTS "JobAdvert" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "requestId" TEXT NOT NULL, "title" TEXT NOT NULL, "text" TEXT NOT NULL, "openFrom" TIMESTAMP(3) NOT NULL,
  "closeAt" TIMESTAMP(3) NOT NULL, "token" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'OPEN', "weightsJson" TEXT NOT NULL DEFAULT '{}',
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "JobAdvert_token_key" ON "JobAdvert" ("token");
CREATE TABLE IF NOT EXISTS "JobApplication" (
  "id" TEXT PRIMARY KEY, "advertId" TEXT NOT NULL, "chairmanId" TEXT NOT NULL, "name" TEXT NOT NULL, "email" TEXT NOT NULL, "phone" TEXT,
  "highestDegree" TEXT NOT NULL, "degreeTitle" TEXT, "university" TEXT, "degreeYear" INTEGER, "teachingYears" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "postPhdYears" DOUBLE PRECISION NOT NULL DEFAULT 0, "industryYears" DOUBLE PRECISION NOT NULL DEFAULT 0, "publicationsJson" TEXT NOT NULL DEFAULT '[]',
  "experienceJson" TEXT NOT NULL DEFAULT '[]', "cvName" TEXT, "cvType" TEXT, "cvData" TEXT, "eligible" BOOLEAN NOT NULL DEFAULT false,
  "eligibilityJson" TEXT NOT NULL DEFAULT '[]', "override" BOOLEAN NOT NULL DEFAULT false, "overrideReason" TEXT, "status" TEXT NOT NULL DEFAULT 'APPLIED',
  "offerSentAt" TIMESTAMP(3), "joinedAt" TIMESTAMP(3), "userId" TEXT, "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "JobApplication_advertId_idx" ON "JobApplication" ("advertId");
CREATE TABLE IF NOT EXISTS "SelectionBoard" (
  "id" TEXT PRIMARY KEY, "advertId" TEXT NOT NULL, "membersJson" TEXT NOT NULL DEFAULT '[]', "interviewAt" TIMESTAMP(3), "venue" TEXT,
  "recommendationJson" TEXT NOT NULL DEFAULT '[]', "recommendedAt" TIMESTAMP(3), "approvedById" TEXT, "approvedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "SelectionBoard_advertId_key" ON "SelectionBoard" ("advertId");
CREATE TABLE IF NOT EXISTS "BoardMark" (
  "id" TEXT PRIMARY KEY, "boardId" TEXT NOT NULL, "applicationId" TEXT NOT NULL, "memberId" TEXT NOT NULL, "marks" DOUBLE PRECISION NOT NULL, "remarks" TEXT,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "BoardMark_boardId_applicationId_memberId_key" ON "BoardMark" ("boardId", "applicationId", "memberId");
SELECT 'done' AS result;
