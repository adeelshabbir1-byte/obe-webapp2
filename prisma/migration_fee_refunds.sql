-- Fee refunds: the institute's refund schedule (HEC fee refund policy by default) and a refund case for each student
-- who leaves, worked out automatically and approved / paid by the Finance Officer. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "FeeRefundRule" (
  "chairmanId" TEXT PRIMARY KEY, "rulesJson" TEXT NOT NULL, "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "FeeRefundCase" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "studentId" TEXT NOT NULL, "statusRequestId" TEXT, "reason" TEXT NOT NULL,
  "withdrawalDate" TIMESTAMP(3) NOT NULL, "classesStart" TIMESTAMP(3), "dayNo" INTEGER, "invoiceId" TEXT,
  "tuitionPaid" DOUBLE PRECISION NOT NULL DEFAULT 0, "nonRefundable" DOUBLE PRECISION NOT NULL DEFAULT 0, "securityDeposit" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "refundPct" DOUBLE PRECISION NOT NULL DEFAULT 0, "refundAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "decidedById" TEXT, "decidedAt" TIMESTAMP(3), "paidAt" TIMESTAMP(3), "paymentRef" TEXT, "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "FeeRefundCase_chairmanId_idx" ON "FeeRefundCase" ("chairmanId");
SELECT 'done' AS result;
