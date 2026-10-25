-- Visiting teaching pay: the Dean's rules, sections marked Visiting, biometric day records, and claims
-- (teacher → Program Lead → Dean → Accounts).
CREATE TABLE IF NOT EXISTS "VisitingPayRule" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "departmentId" TEXT, "basis" TEXT NOT NULL DEFAULT 'LECTURE',
  "rateTheory" DOUBLE PRECISION NOT NULL DEFAULT 0, "rateLab" DOUBLE PRECISION NOT NULL DEFAULT 0, "phdBonusPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "period" TEXT NOT NULL DEFAULT 'MONTHLY', "lateGraceMin" INTEGER NOT NULL DEFAULT 10, "latePenaltyPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "marksWithinDays" INTEGER NOT NULL DEFAULT 14, "requireAttendance" BOOLEAN NOT NULL DEFAULT TRUE, "requireTopics" BOOLEAN NOT NULL DEFAULT TRUE,
  "updatedById" TEXT NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "VisitingPayRule_chairmanId_idx" ON "VisitingPayRule"("chairmanId");
CREATE TABLE IF NOT EXISTS "VisitingAssignment" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "courseId" TEXT NOT NULL, "userId" TEXT NOT NULL, "basis" TEXT, "rate" DOUBLE PRECISION,
  "note" TEXT, "active" BOOLEAN NOT NULL DEFAULT TRUE, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "VisitingAssignment_courseId_userId_key" ON "VisitingAssignment"("courseId", "userId");
CREATE TABLE IF NOT EXISTS "BiometricPunch" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "userId" TEXT NOT NULL, "date" TEXT NOT NULL, "inAt" TEXT, "outAt" TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS "BiometricPunch_userId_date_key" ON "BiometricPunch"("userId", "date");
CREATE TABLE IF NOT EXISTS "VisitingClaim" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "assignmentId" TEXT NOT NULL, "courseId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL, "periodEnd" TIMESTAMP(3) NOT NULL, "linesJson" TEXT NOT NULL DEFAULT '[]', "requirementsJson" TEXT NOT NULL DEFAULT '[]',
  "amount" DOUBLE PRECISION NOT NULL DEFAULT 0, "adjustedAmount" DOUBLE PRECISION, "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "teacherNote" TEXT, "plNote" TEXT, "deanNote" TEXT, "paidRef" TEXT, "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "VisitingClaim_chairmanId_status_idx" ON "VisitingClaim"("chairmanId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "VisitingClaim_assignmentId_periodStart_key" ON "VisitingClaim"("assignmentId", "periodStart");
