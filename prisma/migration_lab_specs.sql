-- PC specifications per lab
CREATE TABLE IF NOT EXISTS "LabComputerSpec" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "labId" TEXT NOT NULL, "quantity" INTEGER NOT NULL DEFAULT 1,
  "makeModel" TEXT, "processor" TEXT, "ramGb" INTEGER, "storage" TEXT, "gpu" TEXT, "os" TEXT, "purchaseYear" INTEGER, "notes" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "LabComputerSpec_labId_idx" ON "LabComputerSpec"("labId");
CREATE INDEX IF NOT EXISTS "LabComputerSpec_chairmanId_idx" ON "LabComputerSpec"("chairmanId");
