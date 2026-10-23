-- Lab equipment and assets (Prompt 2 item 6): the asset register per lab or room, faults and repairs, the yearly
-- stock-taking with sign-off, and condemnation approved by the Institute Head. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "Asset" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "labId" TEXT, "room" TEXT, "category" TEXT NOT NULL DEFAULT 'COMPUTER', "item" TEXT NOT NULL,
  "makeModel" TEXT, "serialNo" TEXT, "assetTag" TEXT NOT NULL, "processor" TEXT, "ramGb" INTEGER, "storage" TEXT, "gpu" TEXT, "os" TEXT, "spec" TEXT,
  "purchaseDate" TIMESTAMP(3), "cost" DOUBLE PRECISION, "supplier" TEXT, "warrantyEnd" TIMESTAMP(3), "custodianId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'WORKING', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Asset_chairmanId_assetTag_key" ON "Asset" ("chairmanId", "assetTag");
CREATE INDEX IF NOT EXISTS "Asset_labId_idx" ON "Asset" ("labId");
CREATE TABLE IF NOT EXISTS "AssetFault" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "assetId" TEXT NOT NULL, "description" TEXT NOT NULL, "reportedBy" TEXT, "reportedById" TEXT,
  "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "status" TEXT NOT NULL DEFAULT 'OPEN', "stepsJson" TEXT NOT NULL DEFAULT '[]',
  "cost" DOUBLE PRECISION, "fixedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "AssetFault_assetId_idx" ON "AssetFault" ("assetId");
CREATE INDEX IF NOT EXISTS "AssetFault_chairmanId_status_idx" ON "AssetFault" ("chairmanId", "status");
CREATE TABLE IF NOT EXISTS "AssetVerification" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "labId" TEXT, "room" TEXT, "year" INTEGER NOT NULL, "foundIds" TEXT NOT NULL DEFAULT '[]',
  "missingIds" TEXT NOT NULL DEFAULT '[]', "note" TEXT, "verifiedById" TEXT NOT NULL, "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AssetVerification_chairmanId_year_idx" ON "AssetVerification" ("chairmanId", "year");
CREATE TABLE IF NOT EXISTS "AssetCondemnation" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "assetId" TEXT NOT NULL, "reason" TEXT NOT NULL, "committeeNote" TEXT, "requestedById" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "decidedById" TEXT, "decidedAt" TIMESTAMP(3), "decisionNote" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AssetCondemnation_chairmanId_status_idx" ON "AssetCondemnation" ("chairmanId", "status");
SELECT 'done' AS result;
