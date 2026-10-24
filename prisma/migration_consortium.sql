-- OBEHUB Consortium, phase 1: the Super Admin's rules book (HEC minimums, versioned by effective date), member
-- universities, their NOCs (ODL / joint programme / accreditation, with expiry), exam centres, and one identity per
-- person across the platform (CNIC) with each account's affiliation — employee of an institute, or a sponsored
-- (industry) account a Chairman vouches for. Safe to run more than once.

CREATE TABLE IF NOT EXISTS "ConsortiumRuleSet" (
  "id" TEXT PRIMARY KEY,
  "version" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "rulesJson" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "note" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ConsortiumRuleSet_version_key" ON "ConsortiumRuleSet"("version");

CREATE TABLE IF NOT EXISTS "ConsortiumMember" (
  "chairmanId" TEXT PRIMARY KEY,
  "status" TEXT NOT NULL DEFAULT 'APPLIED',
  "country" TEXT NOT NULL DEFAULT 'PK',
  "city" TEXT,
  "website" TEXT,
  "hecRecognized" BOOLEAN NOT NULL DEFAULT false,
  "residencyJson" TEXT NOT NULL DEFAULT '{}',
  "contactName" TEXT,
  "contactEmail" TEXT,
  "note" TEXT,
  "appliedById" TEXT,
  "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  "decisionNote" TEXT
);
CREATE INDEX IF NOT EXISTS "ConsortiumMember_status_idx" ON "ConsortiumMember"("status");

CREATE TABLE IF NOT EXISTS "ConsortiumNoc" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "programme" TEXT,
  "issuedOn" TIMESTAMP(3),
  "expiresOn" TIMESTAMP(3),
  "note" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ConsortiumNoc_chairmanId_idx" ON "ConsortiumNoc"("chairmanId");

CREATE TABLE IF NOT EXISTS "ExamCentre" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "campusId" TEXT,
  "name" TEXT NOT NULL,
  "city" TEXT,
  "address" TEXT,
  "seats" INTEGER NOT NULL DEFAULT 0,
  "cctv" BOOLEAN NOT NULL DEFAULT false,
  "biometric" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ExamCentre_chairmanId_idx" ON "ExamCentre"("chairmanId");

CREATE TABLE IF NOT EXISTS "ConsortiumPerson" (
  "id" TEXT PRIMARY KEY,
  "cnic" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ConsortiumPerson_cnic_key" ON "ConsortiumPerson"("cnic");

CREATE TABLE IF NOT EXISTS "ConsortiumAffiliation" (
  "userId" TEXT PRIMARY KEY,
  "personId" TEXT NOT NULL,
  "chairmanId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'EMPLOYEE',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "employer" TEXT,
  "designation" TEXT,
  "highestDegree" TEXT,
  "hecAttestationNo" TEXT,
  "reason" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ConsortiumAffiliation_personId_idx" ON "ConsortiumAffiliation"("personId");
CREATE INDEX IF NOT EXISTS "ConsortiumAffiliation_chairmanId_idx" ON "ConsortiumAffiliation"("chairmanId");
