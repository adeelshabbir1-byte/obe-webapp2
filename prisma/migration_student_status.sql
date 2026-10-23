-- Student status changes with an approval chain (drop, leave, freeze, transfer within / out / in, rustication,
-- readmission), transferred credits, the institute's rules for them, and read-only portal access after leaving.
-- Safe to run more than once.
CREATE TABLE IF NOT EXISTS "StudentStatusRequest" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "effectiveDate" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "fromStatus" TEXT,
  "freezeSemesters" INTEGER,
  "targetBatchId" TEXT,
  "otherInstitute" TEXT,
  "caseReference" TEXT,
  "docName" TEXT,
  "docType" TEXT,
  "docData" TEXT,
  "creditsJson" TEXT NOT NULL DEFAULT '[]',
  "suggested" BOOLEAN NOT NULL DEFAULT false,
  "feeOverride" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "stage" TEXT NOT NULL DEFAULT 'HOD',
  "raisedById" TEXT NOT NULL,
  "raisedAs" TEXT NOT NULL,
  "appliedAt" TIMESTAMP(3),
  "effectsJson" TEXT NOT NULL DEFAULT '[]',
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "StudentStatusRequest_chairmanId_idx" ON "StudentStatusRequest" ("chairmanId");
CREATE INDEX IF NOT EXISTS "StudentStatusRequest_studentId_idx" ON "StudentStatusRequest" ("studentId");
CREATE TABLE IF NOT EXISTS "StudentStatusApproval" (
  "id" TEXT PRIMARY KEY,
  "requestId" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "byId" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "remarks" TEXT,
  "covering" TEXT,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "StudentStatusApproval_requestId_idx" ON "StudentStatusApproval" ("requestId");
CREATE TABLE IF NOT EXISTS "StudentTransferCredit" (
  "id" TEXT PRIMARY KEY,
  "requestId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "fromCode" TEXT NOT NULL,
  "fromTitle" TEXT NOT NULL,
  "creditHours" INTEGER NOT NULL,
  "grade" TEXT,
  "toCode" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "note" TEXT,
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "StudentTransferCredit_requestId_idx" ON "StudentTransferCredit" ("requestId");
CREATE TABLE IF NOT EXISTS "StudentStatusPolicy" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "transferMinGrade" TEXT NOT NULL DEFAULT 'C',
  "transferMaxPct" INTEGER NOT NULL DEFAULT 50,
  "dropDeadlineWeek" INTEGER NOT NULL DEFAULT 8,
  "readOnlyDays" INTEGER NOT NULL DEFAULT 180,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "StudentStatusPolicy_chairmanId_key" ON "StudentStatusPolicy" ("chairmanId");
CREATE TABLE IF NOT EXISTS "StudentAccess" (
  "studentId" TEXT PRIMARY KEY,
  "readOnlyUntil" TIMESTAMP(3),
  "reason" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
SELECT 'done' AS result;
