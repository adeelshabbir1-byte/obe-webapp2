-- Moderation extras: external examiners (a temporary link to vet final papers and results) and moderation remarks
-- (the internal vetter's checklist with each paper decision, and external examiners' remarks). Safe to run more than once.
CREATE TABLE IF NOT EXISTS "ExternalExaminer" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "organisation" TEXT,
  "designation" TEXT,
  "courseIdsJson" TEXT NOT NULL DEFAULT '[]',
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ExternalExaminer_tokenHash_key" ON "ExternalExaminer" ("tokenHash");
CREATE INDEX IF NOT EXISTS "ExternalExaminer_chairmanId_idx" ON "ExternalExaminer" ("chairmanId");
CREATE TABLE IF NOT EXISTS "ModerationRemark" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "examType" TEXT,
  "round" INTEGER,
  "byKind" TEXT NOT NULL,
  "byUserId" TEXT,
  "examinerId" TEXT,
  "decision" TEXT NOT NULL,
  "comments" TEXT,
  "checklistJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ModerationRemark_courseId_idx" ON "ModerationRemark" ("courseId");
SELECT 'done' AS result;
