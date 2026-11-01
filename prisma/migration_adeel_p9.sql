-- Adeel prompt part 9: one register for affiliation work (applications, centres, examiners, exam sessions, claims,
-- notices, faculty approvals, fees, migrations, accreditation status, re-checks), with an event trail; program kinds
-- (ADP / BS) and exit awards; collaborative (dual / double / joint) programmes and ODL records. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "AffRecord" (
  "id" TEXT PRIMARY KEY, "universityId" TEXT NOT NULL, "collegeId" TEXT, "kind" TEXT NOT NULL, "status" TEXT NOT NULL, "title" TEXT NOT NULL,
  "dataJson" TEXT NOT NULL DEFAULT '{}', "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AffRecord_uni_kind_idx" ON "AffRecord"("universityId", "kind");
CREATE INDEX IF NOT EXISTS "AffRecord_college_idx" ON "AffRecord"("collegeId");
CREATE TABLE IF NOT EXISTS "AffEvent" (
  "id" TEXT PRIMARY KEY, "recordId" TEXT NOT NULL, "byId" TEXT NOT NULL, "action" TEXT NOT NULL, "note" TEXT,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AffEvent_record_idx" ON "AffEvent"("recordId");
CREATE TABLE IF NOT EXISTS "ProgramKind" (
  "chairmanId" TEXT NOT NULL, "degreeProgram" TEXT NOT NULL, "kind" TEXT NOT NULL DEFAULT 'BS', "feedsInto" TEXT, "discipline" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY ("chairmanId", "degreeProgram")
);
CREATE TABLE IF NOT EXISTS "ExitAward" (
  "id" TEXT PRIMARY KEY, "studentId" TEXT NOT NULL, "kind" TEXT NOT NULL, "checkJson" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
  "requestedById" TEXT NOT NULL, "decidedById" TEXT, "decidedAt" TIMESTAMP(3), "degreeNo" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ExitAward_student_idx" ON "ExitAward"("studentId");
CREATE TABLE IF NOT EXISTS "CollabProgramme" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "kind" TEXT NOT NULL, "title" TEXT NOT NULL, "dataJson" TEXT NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'DRAFT', "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CollabProgramme_chairman_idx" ON "CollabProgramme"("chairmanId");
