-- Lab inventory, finance entries and extra-curricular activity log
CREATE TABLE IF NOT EXISTS "LabInfo" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "departmentId" TEXT, "name" TEXT NOT NULL, "location" TEXT,
  "seats" INTEGER NOT NULL DEFAULT 0, "computers" INTEGER NOT NULL DEFAULT 0, "computersWorking" INTEGER NOT NULL DEFAULT 0,
  "software" TEXT, "equipment" TEXT, "internetMbps" INTEGER, "lastAudit" TIMESTAMP(3), "notes" TEXT, "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "LabInfo_chairmanId_name_key" ON "LabInfo"("chairmanId", "name");
CREATE INDEX IF NOT EXISTS "LabInfo_chairmanId_idx" ON "LabInfo"("chairmanId");

CREATE TABLE IF NOT EXISTS "FinanceEntry" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "fiscalYear" TEXT NOT NULL, "kind" TEXT NOT NULL, "category" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL DEFAULT 0, "note" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "FinanceEntry_chairmanId_fiscalYear_kind_category_key" ON "FinanceEntry"("chairmanId", "fiscalYear", "kind", "category");
CREATE INDEX IF NOT EXISTS "FinanceEntry_chairmanId_idx" ON "FinanceEntry"("chairmanId");

CREATE TABLE IF NOT EXISTS "ActivityLog" (
  "id" TEXT PRIMARY KEY, "coordinatorId" TEXT NOT NULL, "batchId" TEXT, "title" TEXT NOT NULL, "category" TEXT NOT NULL,
  "activityDate" TIMESTAMP(3) NOT NULL, "organizer" TEXT, "venue" TEXT, "participants" INTEGER, "description" TEXT, "outcome" TEXT, "photo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ActivityLog_coordinatorId_idx" ON "ActivityLog"("coordinatorId");
