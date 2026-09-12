-- Run in Supabase SQL Editor. Brings Alumni/Employer/AlumniEmployment up
-- to the current full design, safely regardless of which earlier version
-- of this feature (if any) your database currently has:
--   1. Adds rollNumber, companySize, industryType, totalWorkExperienceYears,
--      addedById if missing (these predate this migration in some deploys).
--   2. Creates AlumniEmployment if it doesn't exist yet.
--   3. Renames coordinatorId -> chairmanId on Alumni/Employer (institution-
--      wide scope, since any faculty across any Coordinator under one
--      Chairman now shares one pool) — existing data is preserved.
--   4. Adds the approval workflow: status/reviewedById/reviewNote on all
--      three tables, and isAlumniCustodian on User.
--
-- NOTE: if your Coordinators and Chairmen are different user accounts,
-- existing Alumni/Employer rows will be re-scoped to whatever "chairmanId"
-- ends up holding after the rename (their old coordinatorId value) — you
-- may need to manually correct this afterward if that's not the right owner.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isAlumniCustodian" BOOLEAN NOT NULL DEFAULT false;

-- --- Alumni: bring up to full shape ---
ALTER TABLE "Alumni" ADD COLUMN IF NOT EXISTS "rollNumber" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Alumni" ADD COLUMN IF NOT EXISTS "totalWorkExperienceYears" INTEGER;
ALTER TABLE "Alumni" ADD COLUMN IF NOT EXISTS "addedById" TEXT;
ALTER TABLE "Alumni" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Alumni" ADD COLUMN IF NOT EXISTS "reviewedById" TEXT;
ALTER TABLE "Alumni" ADD COLUMN IF NOT EXISTS "reviewNote" TEXT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Alumni' AND column_name = 'coordinatorId') THEN
    ALTER TABLE "Alumni" RENAME COLUMN "coordinatorId" TO "chairmanId";
  END IF;
END $$;
ALTER TABLE "Alumni" ADD COLUMN IF NOT EXISTS "chairmanId" TEXT;
DROP INDEX IF EXISTS "Alumni_coordinatorId_idx";
DROP INDEX IF EXISTS "Alumni_coordinatorId_rollNumber_key";
CREATE INDEX IF NOT EXISTS "Alumni_chairmanId_idx" ON "Alumni"("chairmanId");
CREATE UNIQUE INDEX IF NOT EXISTS "Alumni_chairmanId_rollNumber_key" ON "Alumni"("chairmanId", "rollNumber");

-- --- Employer: bring up to full shape ---
ALTER TABLE "Employer" ADD COLUMN IF NOT EXISTS "companySize" TEXT;
ALTER TABLE "Employer" ADD COLUMN IF NOT EXISTS "industryType" TEXT;
ALTER TABLE "Employer" ADD COLUMN IF NOT EXISTS "addedById" TEXT;
ALTER TABLE "Employer" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Employer" ADD COLUMN IF NOT EXISTS "reviewedById" TEXT;
ALTER TABLE "Employer" ADD COLUMN IF NOT EXISTS "reviewNote" TEXT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Employer' AND column_name = 'coordinatorId') THEN
    ALTER TABLE "Employer" RENAME COLUMN "coordinatorId" TO "chairmanId";
  END IF;
END $$;
ALTER TABLE "Employer" ADD COLUMN IF NOT EXISTS "chairmanId" TEXT;
DROP INDEX IF EXISTS "Employer_coordinatorId_idx";
DROP INDEX IF EXISTS "Employer_coordinatorId_organizationName_key";
CREATE INDEX IF NOT EXISTS "Employer_chairmanId_idx" ON "Employer"("chairmanId");
CREATE UNIQUE INDEX IF NOT EXISTS "Employer_chairmanId_organizationName_key" ON "Employer"("chairmanId", "organizationName");

-- --- AlumniEmployment: create if missing, else bring up to full shape ---
CREATE TABLE IF NOT EXISTS "AlumniEmployment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "alumniId" TEXT NOT NULL REFERENCES "Alumni"("id"),
  "employerId" TEXT NOT NULL REFERENCES "Employer"("id"),
  "jobTitle" TEXT,
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "salaryRange" TEXT,
  "addedById" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reviewedById" TEXT,
  "reviewNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "AlumniEmployment" ADD COLUMN IF NOT EXISTS "addedById" TEXT;
ALTER TABLE "AlumniEmployment" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "AlumniEmployment" ADD COLUMN IF NOT EXISTS "reviewedById" TEXT;
ALTER TABLE "AlumniEmployment" ADD COLUMN IF NOT EXISTS "reviewNote" TEXT;
CREATE INDEX IF NOT EXISTS "AlumniEmployment_alumniId_idx" ON "AlumniEmployment"("alumniId");
CREATE INDEX IF NOT EXISTS "AlumniEmployment_employerId_idx" ON "AlumniEmployment"("employerId");
