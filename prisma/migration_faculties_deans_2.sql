-- Part 2: run after migration_faculties_deans.sql
CREATE TABLE IF NOT EXISTS "Faculty" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Faculty_chairmanId_name_key" ON "Faculty"("chairmanId","name");
CREATE INDEX IF NOT EXISTS "Faculty_chairmanId_idx" ON "Faculty"("chairmanId");

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "facultyId" TEXT REFERENCES "Faculty"("id");
ALTER TABLE "Department" ADD COLUMN IF NOT EXISTS "facultyId" TEXT REFERENCES "Faculty"("id") ON DELETE SET NULL;
ALTER TABLE "TeacherLoanRequest" ADD COLUMN IF NOT EXISTS "requesterDeanStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "TeacherLoanRequest" ADD COLUMN IF NOT EXISTS "lenderDeanStatus" TEXT NOT NULL DEFAULT 'NONE';

CREATE TABLE IF NOT EXISTS "CurriculumDeanApproval" (
  "id" TEXT PRIMARY KEY,
  "facultyId" TEXT NOT NULL REFERENCES "Faculty"("id") ON DELETE CASCADE,
  "curriculumId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'APPROVED',
  "note" TEXT,
  "decidedById" TEXT NOT NULL,
  "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CurriculumDeanApproval_facultyId_curriculumId_key" ON "CurriculumDeanApproval"("facultyId","curriculumId");
CREATE INDEX IF NOT EXISTS "CurriculumDeanApproval_curriculumId_idx" ON "CurriculumDeanApproval"("curriculumId");
