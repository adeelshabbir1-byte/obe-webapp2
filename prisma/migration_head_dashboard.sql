-- Head of institute dashboard (Prompt 2 item 3): figures worked out nightly, and the targets the Institute Head sets.
-- Safe to run more than once.
CREATE TABLE IF NOT EXISTS "DashboardSnapshot" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "dataJson" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "DashboardSnapshot_chairmanId_computedAt_idx" ON "DashboardSnapshot" ("chairmanId", "computedAt");
CREATE TABLE IF NOT EXISTS "DashboardTarget" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "key" TEXT NOT NULL, "target" DOUBLE PRECISION NOT NULL,
  "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "DashboardTarget_chairmanId_key_key" ON "DashboardTarget" ("chairmanId", "key");
SELECT 'done' AS result;
