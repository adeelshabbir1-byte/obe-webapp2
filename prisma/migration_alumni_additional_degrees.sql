-- Run in Supabase SQL Editor. Adds AlumniAdditionalDegree — further
-- education (MS, PhD, certifications) an alumnus completed after
-- graduating from this institution, going through the same
-- submit-then-approve workflow as everything else in this system.

CREATE TABLE IF NOT EXISTS "AlumniAdditionalDegree" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "alumniId" TEXT NOT NULL REFERENCES "Alumni"("id"),
  "degreeName" TEXT NOT NULL,
  "institution" TEXT NOT NULL,
  "completionYear" INTEGER,
  "addedById" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reviewedById" TEXT,
  "reviewNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AlumniAdditionalDegree_alumniId_idx" ON "AlumniAdditionalDegree"("alumniId");
