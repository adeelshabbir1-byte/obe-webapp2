-- Curriculum library and affiliated colleges.
-- CurriculumMeta: a standard code and filter fields for each curriculum, its "effective from" term, and what affiliated
-- colleges may not change. InstituteAffiliation: a college (its own institute account) affiliated to a university.
CREATE TABLE IF NOT EXISTS "CurriculumMeta" (
  "curriculumId" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL,
  "discipline" TEXT,
  "level" TEXT,
  "programCode" TEXT,
  "programName" TEXT,
  "notificationNo" TEXT,
  "effectiveTerm" TEXT,
  "effectiveYear" INTEGER,
  "lockScheme" BOOLEAN NOT NULL DEFAULT true,
  "lockGa" BOOLEAN NOT NULL DEFAULT true,
  "lockClo" BOOLEAN NOT NULL DEFAULT true,
  "aliasesJson" TEXT NOT NULL DEFAULT '[]',
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CurriculumMeta_code_idx" ON "CurriculumMeta"("code");
CREATE INDEX IF NOT EXISTS "CurriculumMeta_programCode_idx" ON "CurriculumMeta"("programCode");

CREATE TABLE IF NOT EXISTS "InstituteAffiliation" (
  "collegeId" TEXT PRIMARY KEY,
  "universityId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "since" TIMESTAMP(3),
  "note" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "InstituteAffiliation_universityId_idx" ON "InstituteAffiliation"("universityId");
