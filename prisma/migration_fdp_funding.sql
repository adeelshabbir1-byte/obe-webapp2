-- Faculty development funding: study leave and scholarships (amounts, sponsor, bond, progress reports, return,
-- refund if the bond is broken) and conference / training grants. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "FdpFunding" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "userId" TEXT NOT NULL, "kind" TEXT NOT NULL, "sponsor" TEXT NOT NULL, "sponsorName" TEXT,
  "purpose" TEXT NOT NULL, "place" TEXT, "country" TEXT,
  "feeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0, "stipendAmount" DOUBLE PRECISION NOT NULL DEFAULT 0, "travelAmount" DOUBLE PRECISION NOT NULL DEFAULT 0, "otherAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "sanctionedAt" TIMESTAMP(3), "startDate" TIMESTAMP(3), "expectedReturn" TIMESTAMP(3), "actualReturn" TIMESTAMP(3), "bondYears" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE', "refundDue" DOUBLE PRECISION, "refundPaid" DOUBLE PRECISION, "notes" TEXT,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "FdpFunding_chairmanId_idx" ON "FdpFunding" ("chairmanId");
CREATE TABLE IF NOT EXISTS "FdpProgress" (
  "id" TEXT PRIMARY KEY, "fundingId" TEXT NOT NULL, "term" TEXT NOT NULL, "report" TEXT NOT NULL, "submittedById" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "reviewNote" TEXT, "reviewedById" TEXT
);
CREATE INDEX IF NOT EXISTS "FdpProgress_fundingId_idx" ON "FdpProgress" ("fundingId");
SELECT 'done' AS result;
