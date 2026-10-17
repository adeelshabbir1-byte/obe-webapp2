-- HEC national curriculum bank: the national authority, committee reviews of shared courses, versioned national releases,
-- and which universities adopted which release. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "NationalAuthority" ("chairmanId" TEXT PRIMARY KEY, "name" TEXT NOT NULL DEFAULT 'HEC', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS "BankReview" ("id" TEXT PRIMARY KEY, "publicCourseId" TEXT NOT NULL, "reviewerId" TEXT NOT NULL, "verdict" TEXT NOT NULL, "comment" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX IF NOT EXISTS "BankReview_publicCourseId_reviewerId_key" ON "BankReview" ("publicCourseId", "reviewerId");
CREATE TABLE IF NOT EXISTS "NationalRelease" ("id" TEXT PRIMARY KEY, "authorityId" TEXT NOT NULL, "framework" TEXT NOT NULL, "discipline" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 1, "title" TEXT NOT NULL, "notes" TEXT, "status" TEXT NOT NULL DEFAULT 'DRAFT', "publishedAt" TIMESTAMP(3), "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "NationalRelease_framework_discipline_idx" ON "NationalRelease" ("framework", "discipline");
CREATE TABLE IF NOT EXISTS "NationalReleaseCourse" ("id" TEXT PRIMARY KEY, "releaseId" TEXT NOT NULL, "publicCourseId" TEXT, "code" TEXT NOT NULL, "title" TEXT NOT NULL, "creditHours" INTEGER NOT NULL, "courseType" TEXT NOT NULL DEFAULT 'Core', "snapshotJson" TEXT NOT NULL, "contributorInstitute" TEXT, "contributorId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "NationalReleaseCourse_releaseId_idx" ON "NationalReleaseCourse" ("releaseId");
CREATE TABLE IF NOT EXISTS "NationalAdoption" ("id" TEXT PRIMARY KEY, "releaseCourseId" TEXT NOT NULL, "chairmanId" TEXT NOT NULL, "courseId" TEXT NOT NULL, "importedById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "NationalAdoption_releaseCourseId_idx" ON "NationalAdoption" ("releaseCourseId");
SELECT 'done' AS result;
