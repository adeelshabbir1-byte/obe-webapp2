-- OBE certification: exam attempts (a passed attempt is the badge) and the institute's training rule. Safe to re-run.
CREATE TABLE IF NOT EXISTS "TrainingAttempt" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "badge" TEXT NOT NULL, "idsJson" TEXT NOT NULL, "answersJson" TEXT NOT NULL DEFAULT '{}', "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "submittedAt" TIMESTAMP(3), "score" INTEGER, "total" INTEGER, "passed" BOOLEAN NOT NULL DEFAULT false);
CREATE INDEX IF NOT EXISTS "TrainingAttempt_userId_badge_idx" ON "TrainingAttempt" ("userId", "badge");
CREATE TABLE IF NOT EXISTS "TrainingPolicy" ("chairmanId" TEXT PRIMARY KEY, "enabled" BOOLEAN NOT NULL DEFAULT false, "graceUntil" TIMESTAMP(3), "exemptJson" TEXT NOT NULL DEFAULT '[]', "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
SELECT 'done' AS result;
