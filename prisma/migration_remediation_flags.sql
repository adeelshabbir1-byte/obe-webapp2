-- Remediation flags: the advisor, the course's teacher, the next course's teacher or the OMC flag students who need
-- remediation on topics; planners turn the flags into remediation plans. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "RemediationFlag" ("id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "studentId" TEXT NOT NULL, "courseId" TEXT NOT NULL, "courseCode" TEXT NOT NULL, "topicsJson" TEXT NOT NULL, "reason" TEXT, "flaggedById" TEXT NOT NULL, "flaggedAs" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'OPEN', "planId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "RemediationFlag_chairmanId_status_idx" ON "RemediationFlag" ("chairmanId", "status");
CREATE INDEX IF NOT EXISTS "RemediationFlag_studentId_idx" ON "RemediationFlag" ("studentId");
SELECT 'done' AS result;
