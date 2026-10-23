-- Students with disabilities: a confidential register with each student's accommodations (extra exam time, seating,
-- materials, assistive technology). Safe to run more than once.
CREATE TABLE IF NOT EXISTS "DisabilityRecord" (
  "studentId" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "category" TEXT NOT NULL, "details" TEXT,
  "extraTimePct" INTEGER NOT NULL DEFAULT 0, "seating" TEXT, "materials" TEXT, "assistive" TEXT, "other" TEXT,
  "validUntil" TIMESTAMP(3), "verified" BOOLEAN NOT NULL DEFAULT false, "recordedById" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "DisabilityRecord_chairmanId_idx" ON "DisabilityRecord" ("chairmanId");
SELECT 'done' AS result;
