-- Course Lead (one teacher of a multi-section course finalises the paper, the others approve it)
CREATE TABLE IF NOT EXISTS "CourseLead" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "teamKey" TEXT NOT NULL,
  "leadId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "assignedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CourseLead_chairmanId_teamKey_key" ON "CourseLead"("chairmanId","teamKey");
CREATE INDEX IF NOT EXISTS "CourseLead_leadId_idx" ON "CourseLead"("leadId");

CREATE TABLE IF NOT EXISTS "PaperSubmission" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "teamKey" TEXT NOT NULL,
  "examType" TEXT NOT NULL,
  "leadCourseId" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "PaperSubmission_chairmanId_teamKey_examType_key" ON "PaperSubmission"("chairmanId","teamKey","examType");

CREATE TABLE IF NOT EXISTS "PaperApproval" (
  "id" TEXT PRIMARY KEY,
  "submissionId" TEXT NOT NULL REFERENCES "PaperSubmission"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "note" TEXT,
  "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "PaperApproval_submissionId_userId_key" ON "PaperApproval"("submissionId","userId");
