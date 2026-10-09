-- Library inventory
CREATE TABLE IF NOT EXISTS "LibraryInfo" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL UNIQUE, "seats" INTEGER NOT NULL DEFAULT 0, "totalTitles" INTEGER NOT NULL DEFAULT 0,
  "computingTitles" INTEGER NOT NULL DEFAULT 0, "totalVolumes" INTEGER NOT NULL DEFAULT 0, "printJournals" INTEGER NOT NULL DEFAULT 0,
  "ebooks" INTEGER NOT NULL DEFAULT 0, "databases" TEXT, "openHoursPerWeek" INTEGER, "hasLibrarian" BOOLEAN NOT NULL DEFAULT false,
  "lastStockCheck" TIMESTAMP(3), "notes" TEXT, "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
