-- Research office / ORIC (Prompt 2 item 8): grant proposals, ORCID / Google Scholar links, imported publications waiting
-- for the faculty member to confirm, the institute's journal list (HEC category, impact factor) and ORIC staff.
-- Safe to run more than once.
CREATE TABLE IF NOT EXISTS "GrantProposal" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "piId" TEXT NOT NULL, "title" TEXT NOT NULL, "agency" TEXT NOT NULL, "callName" TEXT,
  "amount" DOUBLE PRECISION, "durationMonths" INTEGER, "coInvestigators" TEXT, "abstract" TEXT, "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "reviewNote" TEXT, "reviewedById" TEXT, "submittedAt" TIMESTAMP(3), "decidedAt" TIMESTAMP(3), "awardedAmount" DOUBLE PRECISION,
  "startDate" TIMESTAMP(3), "endDate" TIMESTAMP(3), "fundedRecordId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "GrantProposal_chairmanId_idx" ON "GrantProposal" ("chairmanId", "status");
CREATE TABLE IF NOT EXISTS "ResearchProfile" (
  "userId" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "orcid" TEXT, "scholarUrl" TEXT, "lastImportAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "PublicationCandidate" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "source" TEXT NOT NULL, "dedupeKey" TEXT NOT NULL, "title" TEXT NOT NULL, "journal" TEXT, "year" INTEGER,
  "doi" TEXT, "authors" TEXT, "citations" INTEGER, "category" TEXT, "impactFactor" DOUBLE PRECISION, "status" TEXT NOT NULL DEFAULT 'PENDING',
  "studentWork" BOOLEAN NOT NULL DEFAULT false, "recordId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "PublicationCandidate_userId_dedupeKey_key" ON "PublicationCandidate" ("userId", "dedupeKey");
CREATE TABLE IF NOT EXISTS "JournalCategory" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "title" TEXT NOT NULL, "issn" TEXT, "category" TEXT NOT NULL, "impactFactor" DOUBLE PRECISION,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "JournalCategory_chairmanId_idx" ON "JournalCategory" ("chairmanId");
CREATE TABLE IF NOT EXISTS "ResearchSetting" (
  "chairmanId" TEXT PRIMARY KEY, "oricUserIds" TEXT NOT NULL DEFAULT '[]', "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
SELECT 'done' AS result;
