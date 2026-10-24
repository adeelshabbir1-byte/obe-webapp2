-- Regulations Library: official documents of HEC, NCEAC, NBEAC, PEC … (and consortium MoUs), the clauses OBEHUB
-- relies on, and where each clause is applied in the portal. Files live in the private Supabase Storage bucket
-- "regulations"; the database keeps their paths. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "RegDocument" (
  "id" TEXT PRIMARY KEY,
  "council" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "number" TEXT,
  "issuedOn" TIMESTAMP(3),
  "effectiveFrom" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "supersedesId" TEXT,
  "url" TEXT,
  "summary" TEXT,
  "textContent" TEXT,
  "agreementId" TEXT,
  "confirmJson" TEXT NOT NULL DEFAULT '{}',
  "submittedById" TEXT NOT NULL,
  "instituteId" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "RegDocument_status_idx" ON "RegDocument"("status");
CREATE INDEX IF NOT EXISTS "RegDocument_council_idx" ON "RegDocument"("council");
CREATE INDEX IF NOT EXISTS "RegDocument_agreementId_idx" ON "RegDocument"("agreementId");
CREATE TABLE IF NOT EXISTS "RegFile" (
  "id" TEXT PRIMARY KEY,
  "docId" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "size" INTEGER NOT NULL DEFAULT 0,
  "caption" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "RegFile_docId_idx" ON "RegFile"("docId");
CREATE TABLE IF NOT EXISTS "RegClause" (
  "id" TEXT PRIMARY KEY,
  "docId" TEXT NOT NULL,
  "ref" TEXT NOT NULL,
  "page" INTEGER,
  "quote" TEXT NOT NULL,
  "imageFileId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "RegClause_docId_idx" ON "RegClause"("docId");
CREATE TABLE IF NOT EXISTS "RegLink" (
  "clauseId" TEXT NOT NULL,
  "target" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("clauseId", "target")
);
CREATE INDEX IF NOT EXISTS "RegLink_target_idx" ON "RegLink"("target");
