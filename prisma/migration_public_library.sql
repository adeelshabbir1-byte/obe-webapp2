-- Run in Supabase SQL Editor (safe to run more than once).
-- Public course library + platform (master-curriculum) Subject Experts.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "organization" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isPlatformExpert" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "MasterCourse" ADD COLUMN IF NOT EXISTS "designerId" TEXT;
DO $$ BEGIN
  ALTER TABLE "MasterCourse" ADD CONSTRAINT "MasterCourse_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "PublicCourse" (
  "id" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "sourceCourseId" TEXT,
  "plan" TEXT NOT NULL DEFAULT 'SE',
  "instituteName" TEXT,
  "authorOrganization" TEXT,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "creditHours" INTEGER NOT NULL,
  "courseType" TEXT NOT NULL DEFAULT 'Core',
  "summary" TEXT,
  "searchText" TEXT NOT NULL,
  "snapshotJson" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewComment" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "importCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublicCourse_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PublicCourse_status_idx" ON "PublicCourse"("status");
CREATE INDEX IF NOT EXISTS "PublicCourse_authorId_idx" ON "PublicCourse"("authorId");
DO $$ BEGIN
  ALTER TABLE "PublicCourse" ADD CONSTRAINT "PublicCourse_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "PublicCourseImport" (
  "id" TEXT NOT NULL,
  "publicCourseId" TEXT NOT NULL,
  "importedById" TEXT NOT NULL,
  "importedIntoCourseId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublicCourseImport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PublicCourseImport_publicCourseId_idx" ON "PublicCourseImport"("publicCourseId");
DO $$ BEGIN
  ALTER TABLE "PublicCourseImport" ADD CONSTRAINT "PublicCourseImport_publicCourseId_fkey" FOREIGN KEY ("publicCourseId") REFERENCES "PublicCourse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
