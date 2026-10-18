-- ============================================================================
-- Council tools: SAR table status (ready marks with a fingerprint of the
-- approved data), council eligibility answers (NBEAC / PEC), and the map of a
-- batch's GAs to its council's attributes (PEC EGA, NCEAC CGA, NBEAC BGA).
-- Safe to run more than once; it only adds tables.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "SarItemState" (
  "id" TEXT NOT NULL,
  "scopeKey" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "itemKey" TEXT NOT NULL,
  "hash" TEXT NOT NULL,
  "readyAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readyById" TEXT,
  "readyByName" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SarItemState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SarItemState_scopeKey_body_itemKey_key" ON "SarItemState"("scopeKey", "body", "itemKey");

CREATE TABLE IF NOT EXISTS "CouncilEligibility" (
  "id" TEXT NOT NULL,
  "chairmanId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "program" TEXT NOT NULL,
  "inputsJson" TEXT NOT NULL DEFAULT '{}',
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CouncilEligibility_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CouncilEligibility_chairmanId_body_program_key" ON "CouncilEligibility"("chairmanId", "body", "program");

CREATE TABLE IF NOT EXISTS "GaCouncilMap" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "ploId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "attrsJson" TEXT NOT NULL DEFAULT '[]',
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GaCouncilMap_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "GaCouncilMap_ploId_body_key" ON "GaCouncilMap"("ploId", "body");
CREATE INDEX IF NOT EXISTS "GaCouncilMap_batchId_body_idx" ON "GaCouncilMap"("batchId", "body");
