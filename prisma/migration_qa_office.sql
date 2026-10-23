-- Quality Office registers (lib/qaOffice.ts): new program approvals, PQR, Citizen Portal complaints, rankings data,
-- department reviews, awareness sessions, affiliated colleges, the QA profile and yearly plan, and action plans.
CREATE TABLE IF NOT EXISTS "QaRecord" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "refId" TEXT,
  "dataJson" TEXT NOT NULL DEFAULT '{}',
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "QaRecord_chairmanId_kind_idx" ON "QaRecord"("chairmanId","kind");
CREATE INDEX IF NOT EXISTS "QaRecord_refId_idx" ON "QaRecord"("refId");
