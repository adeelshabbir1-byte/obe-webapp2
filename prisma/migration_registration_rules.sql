-- ============================================================================
-- Registration rules, Institute Head exemptions and advisor-locked degree plans.
-- Run once in Supabase's SQL Editor. Safe to run again (IF NOT EXISTS); nothing is dropped.
-- ============================================================================
CREATE TABLE IF NOT EXISTS "RegistrationPolicy" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "lowCgpaThreshold" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
  "minCreditsNormal" INTEGER NOT NULL DEFAULT 12,
  "maxCreditsNormal" INTEGER NOT NULL DEFAULT 18,
  "maxCreditsLowCgpa" INTEGER NOT NULL DEFAULT 15,
  "maxNewCoursesLowCgpa" INTEGER NOT NULL DEFAULT 2,
  "maxCreditsFinalYear" INTEGER NOT NULL DEFAULT 21,
  "maxCreditsSummer" INTEGER NOT NULL DEFAULT 9,
  "allowConcurrentPrereq" BOOLEAN NOT NULL DEFAULT false,
  "creditRules" TEXT NOT NULL DEFAULT '[]',
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "RegistrationPolicy_chairmanId_key" ON "RegistrationPolicy"("chairmanId");

CREATE TABLE IF NOT EXISTS "RegistrationExemption" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "rule" TEXT NOT NULL,
  "courseCode" TEXT,
  "value" INTEGER,
  "reason" TEXT NOT NULL,
  "grantedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "RegistrationExemption_studentId_idx" ON "RegistrationExemption"("studentId");
CREATE INDEX IF NOT EXISTS "RegistrationExemption_chairmanId_idx" ON "RegistrationExemption"("chairmanId");

CREATE TABLE IF NOT EXISTS "DegreePlanLock" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "studentId" TEXT NOT NULL,
  "lockedById" TEXT NOT NULL,
  "note" TEXT,
  "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "DegreePlanLock_studentId_key" ON "DegreePlanLock"("studentId");
