-- Billing for institutes (Prompt 2 item 9): plans, each institute's subscription (trial, discount, grace period and the
-- lock it is in), invoices and payments. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "BillingPlan" (
  "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "modulesJson" TEXT NOT NULL DEFAULT '[]', "pricing" TEXT NOT NULL DEFAULT 'PER_STUDENT',
  "price" DOUBLE PRECISION NOT NULL DEFAULT 0, "period" TEXT NOT NULL DEFAULT 'TERM', "active" BOOLEAN NOT NULL DEFAULT true, "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "Subscription" (
  "chairmanId" TEXT PRIMARY KEY, "planId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'TRIAL', "trialEndsAt" TIMESTAMP(3), "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "discountPct" DOUBLE PRECISION NOT NULL DEFAULT 0, "discountNote" TEXT, "graceDays" INTEGER NOT NULL DEFAULT 15, "readOnlyDays" INTEGER NOT NULL DEFAULT 15,
  "billingEmail" TEXT, "lockState" TEXT NOT NULL DEFAULT 'NONE', "lockedByBillingJson" TEXT NOT NULL DEFAULT '[]', "lockChangedAt" TIMESTAMP(3),
  "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "BillingInvoice" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "number" TEXT NOT NULL, "planId" TEXT, "periodStart" TIMESTAMP(3) NOT NULL, "periodEnd" TIMESTAMP(3) NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "dueAt" TIMESTAMP(3) NOT NULL, "students" INTEGER NOT NULL DEFAULT 0, "amount" DOUBLE PRECISION NOT NULL,
  "discount" DOUBLE PRECISION NOT NULL DEFAULT 0, "total" DOUBLE PRECISION NOT NULL, "status" TEXT NOT NULL DEFAULT 'DUE', "paidAt" TIMESTAMP(3), "linesJson" TEXT NOT NULL DEFAULT '[]',
  "remindedAt" TIMESTAMP(3), "createdById" TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS "BillingInvoice_number_key" ON "BillingInvoice" ("number");
CREATE INDEX IF NOT EXISTS "BillingInvoice_chairmanId_idx" ON "BillingInvoice" ("chairmanId", "status");
CREATE TABLE IF NOT EXISTS "BillingPayment" (
  "id" TEXT PRIMARY KEY, "invoiceId" TEXT NOT NULL, "chairmanId" TEXT NOT NULL, "amount" DOUBLE PRECISION NOT NULL, "method" TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
  "reference" TEXT, "paidOn" TIMESTAMP(3) NOT NULL, "recordedById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "BillingPayment_invoiceId_idx" ON "BillingPayment" ("invoiceId");
SELECT 'done' AS result;
