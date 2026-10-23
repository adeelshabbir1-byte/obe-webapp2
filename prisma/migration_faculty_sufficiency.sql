-- NBEAC faculty qualification and sufficiency: a reviewer's override of a teacher's AQ / PQ classification, and the
-- institute's limits for the Standard 4 ratios. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "FacultyQualification" (
  "userId" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "note" TEXT,
  "setById" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "FacultyQualification_chairmanId_idx" ON "FacultyQualification" ("chairmanId");
CREATE TABLE IF NOT EXISTS "FacultySufficiencyRule" (
  "chairmanId" TEXT PRIMARY KEY,
  "rulesJson" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
SELECT 'done' AS result;
