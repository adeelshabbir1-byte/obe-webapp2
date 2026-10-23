-- Employee benefits register: plans (health insurance, provident fund, pension, leave encashment, children's fee
-- concession, transport, housing), who is enrolled, and claims. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "BenefitPlan" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "kind" TEXT NOT NULL, "name" TEXT NOT NULL, "provider" TEXT, "policyNo" TEXT,
  "coverage" TEXT, "limitAmount" DOUBLE PRECISION, "dependants" TEXT, "premium" DOUBLE PRECISION, "employerSharePct" DOUBLE PRECISION, "employeeSharePct" DOUBLE PRECISION,
  "eligibility" TEXT, "renewalDate" TIMESTAMP(3), "active" BOOLEAN NOT NULL DEFAULT true, "lastRenewalNotice" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "BenefitPlan_chairmanId_idx" ON "BenefitPlan" ("chairmanId");
CREATE TABLE IF NOT EXISTS "BenefitEnrolment" (
  "id" TEXT PRIMARY KEY, "planId" TEXT NOT NULL, "userId" TEXT NOT NULL, "dependantsCount" INTEGER, "amount" DOUBLE PRECISION, "startDate" TIMESTAMP(3), "endDate" TIMESTAMP(3), "note" TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS "BenefitEnrolment_planId_userId_key" ON "BenefitEnrolment" ("planId", "userId");
CREATE TABLE IF NOT EXISTS "BenefitClaim" (
  "id" TEXT PRIMARY KEY, "planId" TEXT NOT NULL, "userId" TEXT NOT NULL, "date" TIMESTAMP(3) NOT NULL, "amount" DOUBLE PRECISION NOT NULL, "description" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED', "decidedById" TEXT, "decidedAt" TIMESTAMP(3), "note" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "BenefitClaim_planId_idx" ON "BenefitClaim" ("planId");
SELECT 'done' AS result;
