-- Campus-management API keys, the written question bank, read-only links for visiting panels and for parents.
-- Safe to run more than once.
CREATE TABLE IF NOT EXISTS "InstituteApiKey" (
  "id" TEXT NOT NULL, "chairmanId" TEXT NOT NULL, "label" TEXT NOT NULL, "keyHash" TEXT NOT NULL,
  "lastUsedAt" TIMESTAMP(3), "revokedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InstituteApiKey_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "InstituteApiKey_keyHash_idx" ON "InstituteApiKey"("keyHash");
CREATE TABLE IF NOT EXISTS "QuestionBankItem" (
  "id" TEXT NOT NULL, "chairmanId" TEXT NOT NULL, "courseCode" TEXT NOT NULL, "cloCode" TEXT NOT NULL, "bloom" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'SHORT', "marks" DOUBLE PRECISION NOT NULL, "text" TEXT NOT NULL, "usedCount" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuestionBankItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "QuestionBankItem_chairmanId_courseCode_idx" ON "QuestionBankItem"("chairmanId", "courseCode");
CREATE TABLE IF NOT EXISTS "VisitorPass" (
  "id" TEXT NOT NULL, "cycleId" TEXT NOT NULL, "token" TEXT NOT NULL, "label" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3), "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VisitorPass_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "VisitorPass_token_key" ON "VisitorPass"("token");
CREATE TABLE IF NOT EXISTS "ParentLink" (
  "id" TEXT NOT NULL, "studentId" TEXT NOT NULL, "token" TEXT NOT NULL, "createdById" TEXT NOT NULL, "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParentLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ParentLink_token_key" ON "ParentLink"("token");
CREATE INDEX IF NOT EXISTS "ParentLink_studentId_idx" ON "ParentLink"("studentId");
