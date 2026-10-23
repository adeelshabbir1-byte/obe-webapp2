-- Position titles of the institute (VC / Rector / Director …), positions switched off, acting holders and moved branches
-- of the organisation chart. Run after migration_org_chart.sql. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "InstituteTitle" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "InstituteTitle_chairmanId_key_key" ON "InstituteTitle" ("chairmanId", "key");
CREATE TABLE IF NOT EXISTS "OrgActing" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "positionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "fromDate" TIMESTAMP(3) NOT NULL,
  "toDate" TIMESTAMP(3) NOT NULL,
  "reason" TEXT,
  "byId" TEXT NOT NULL,
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "OrgActing_chairmanId_idx" ON "OrgActing" ("chairmanId");
CREATE INDEX IF NOT EXISTS "OrgActing_positionId_idx" ON "OrgActing" ("positionId");
CREATE TABLE IF NOT EXISTS "OrgMove" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "positionId" TEXT NOT NULL,
  "fromParentId" TEXT,
  "toParentId" TEXT,
  "effectsJson" TEXT NOT NULL DEFAULT '[]',
  "byId" TEXT NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "undoneAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "OrgMove_chairmanId_idx" ON "OrgMove" ("chairmanId");
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'OrgPosition') THEN
    ALTER TABLE "OrgPosition" ADD COLUMN IF NOT EXISTS "offAt" TIMESTAMP(3);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'OrgPositionLog') THEN
    ALTER TABLE "OrgPositionLog" ADD COLUMN IF NOT EXISTS "reason" TEXT;
  END IF;
END $$;
SELECT 'done' AS result;
