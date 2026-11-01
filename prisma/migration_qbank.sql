-- Part 6 build A: one question bank for every type — review, visibility and access codes, the 3-term re-use lock,
-- results per question, drafted papers and versions, the bank PIN. Side tables beside QuestionBankItem / QbMeta.
-- Safe to run twice.
CREATE TABLE IF NOT EXISTS "QbExt" (
  "itemId" TEXT PRIMARY KEY,
  "baseCourseId" TEXT,
  "type" TEXT NOT NULL DEFAULT 'SHORT',
  "status" TEXT NOT NULL DEFAULT 'APPROVED',
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNote" TEXT,
  "visibility" TEXT NOT NULL DEFAULT 'COURSE',
  "sharedWithJson" TEXT NOT NULL DEFAULT '[]',
  "modelAnswer" TEXT,
  "minutes" INTEGER,
  "sourceKind" TEXT NOT NULL DEFAULT 'OWN',
  "sourceNote" TEXT,
  "partsJson" TEXT NOT NULL DEFAULT '[]',
  "correctJson" TEXT,
  "numericAnswer" DOUBLE PRECISION,
  "tolerance" DOUBLE PRECISION,
  "tolMode" TEXT,
  "testCasesJson" TEXT,
  "lab" BOOLEAN NOT NULL DEFAULT false,
  "lockedUntil" INTEGER,
  "aiDraft" BOOLEAN NOT NULL DEFAULT false,
  "measuredDifficulty" TEXT,
  "flagsJson" TEXT NOT NULL DEFAULT '[]',
  "statsJson" TEXT NOT NULL DEFAULT '{}',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "QbExt_baseCourseId_idx" ON "QbExt" ("baseCourseId");

CREATE TABLE IF NOT EXISTS "QbUse" (
  "id" TEXT PRIMARY KEY,
  "itemId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "examType" TEXT NOT NULL,
  "termLabel" TEXT NOT NULL DEFAULT '',
  "paperId" TEXT,
  "questionNo" INTEGER,
  "byUserId" TEXT,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "QbUse_itemId_idx" ON "QbUse" ("itemId");

CREATE TABLE IF NOT EXISTS "QbGrant" (
  "id" TEXT PRIMARY KEY,
  "authorId" TEXT NOT NULL,
  "itemIdsJson" TEXT NOT NULL,
  "granteeId" TEXT,
  "codeHash" TEXT,
  "purpose" TEXT,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "usedById" TEXT,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "QbGrant_authorId_idx" ON "QbGrant" ("authorId");
CREATE INDEX IF NOT EXISTS "QbGrant_granteeId_idx" ON "QbGrant" ("granteeId");

CREATE TABLE IF NOT EXISTS "QbLog" (
  "id" TEXT PRIMARY KEY,
  "itemId" TEXT,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "detail" TEXT NOT NULL DEFAULT '',
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "QbLog_itemId_idx" ON "QbLog" ("itemId");
CREATE INDEX IF NOT EXISTS "QbLog_actorId_idx" ON "QbLog" ("actorId");

CREATE TABLE IF NOT EXISTS "QbPin" (
  "userId" TEXT PRIMARY KEY,
  "pinHash" TEXT NOT NULL,
  "failed" INTEGER NOT NULL DEFAULT 0,
  "lastActiveAt" TIMESTAMP(3),
  "sessionToken" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "QbPin" ADD COLUMN IF NOT EXISTS "sessionToken" TEXT;

CREATE TABLE IF NOT EXISTS "QbPaper" (
  "id" TEXT PRIMARY KEY,
  "courseId" TEXT NOT NULL,
  "examType" TEXT NOT NULL,
  "termLabel" TEXT NOT NULL DEFAULT '',
  "variant" TEXT NOT NULL DEFAULT 'A',
  "parentId" TEXT,
  "itemIdsJson" TEXT NOT NULL,
  "optsJson" TEXT NOT NULL DEFAULT '{}',
  "checkJson" TEXT NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "QbPaper_courseId_idx" ON "QbPaper" ("courseId");
