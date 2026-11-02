-- Affiliated colleges' results on both sides: university registration numbers of college students, the college's
-- submitted (locked) sessional marks, and the university's own OBE record of
-- every college student (CLO and graduate-attribute results per course) for OBE transcripts. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "AffStudentReg" (
  "studentId" TEXT PRIMARY KEY, "universityId" TEXT NOT NULL, "collegeId" TEXT NOT NULL, "regNo" TEXT, "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "confirmedAt" TIMESTAMP(3), "confirmedById" TEXT
);
CREATE INDEX IF NOT EXISTS "AffStudentReg_uni_idx" ON "AffStudentReg"("universityId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "AffStudentReg_uni_reg_key" ON "AffStudentReg"("universityId", "regNo");
CREATE TABLE IF NOT EXISTS "UniSessional" (
  "id" TEXT PRIMARY KEY, "paperId" TEXT NOT NULL, "collegeId" TEXT NOT NULL, "courseId" TEXT NOT NULL, "studentId" TEXT NOT NULL, "regNo" TEXT,
  "pct" DOUBLE PRECISION, "cloJson" TEXT NOT NULL DEFAULT '{}', "submittedById" TEXT NOT NULL, "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "UniSessional_key" ON "UniSessional"("paperId", "studentId");
CREATE TABLE IF NOT EXISTS "UniObeRecord" (
  "id" TEXT PRIMARY KEY, "universityId" TEXT NOT NULL, "collegeId" TEXT NOT NULL, "studentId" TEXT NOT NULL, "regNo" TEXT, "courseCode" TEXT NOT NULL,
  "courseTitle" TEXT, "term" TEXT, "totalPct" DOUBLE PRECISION, "cloJson" TEXT NOT NULL DEFAULT '[]', "gaJson" TEXT NOT NULL DEFAULT '[]',
  "paperId" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "UniObeRecord_key" ON "UniObeRecord"("universityId", "studentId", "courseCode", "term");
CREATE INDEX IF NOT EXISTS "UniObeRecord_reg_idx" ON "UniObeRecord"("universityId", "regNo");
