-- Student feedback questionnaires set by the QEC In-charge (questions with groups, weights and versions), the feedback
-- window and minimum answers, and the link from weak questions to FDP workshops. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "FeedbackQuestion" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "groupName" TEXT NOT NULL DEFAULT 'General',
  "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "orderIndex" INTEGER NOT NULL DEFAULT 0,
  "text" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "retiredAt" TIMESTAMP(3),
  "fdpTopic" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "FeedbackQuestion_chairmanId_kind_key_key" ON "FeedbackQuestion" ("chairmanId", "kind", "key");
CREATE TABLE IF NOT EXISTS "FeedbackQuestionVersion" (
  "id" TEXT PRIMARY KEY,
  "questionId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "text" TEXT NOT NULL,
  "byId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "FeedbackQuestionVersion_questionId_idx" ON "FeedbackQuestionVersion" ("questionId");
CREATE TABLE IF NOT EXISTS "FeedbackSettings" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "fromWeek" INTEGER,
  "toWeek" INTEGER,
  "minResponses" INTEGER NOT NULL DEFAULT 5,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "FeedbackSettings_chairmanId_key" ON "FeedbackSettings" ("chairmanId");
CREATE TABLE IF NOT EXISTS "FeedbackFdpInvite" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "questionKey" TEXT NOT NULL,
  "scoreBefore" DOUBLE PRECISION,
  "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "FeedbackFdpInvite_sessionId_userId_key" ON "FeedbackFdpInvite" ("sessionId", "userId");
SELECT 'done' AS result;
