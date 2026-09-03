-- Run in Supabase SQL Editor. Adds MFA fields, session MFA-verified flag,
-- and the CqiRecord table.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "mfaSecret" TEXT,
  ADD COLUMN IF NOT EXISTS "mfaBackupCodes" TEXT;

ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "mfaVerified" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "CqiRecord" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "chairmanId" TEXT NOT NULL REFERENCES "User"("id"),
  "authorId" TEXT NOT NULL,
  "batchId" TEXT REFERENCES "Batch"("id"),
  "courseId" TEXT REFERENCES "Course"("id"),
  "finding" TEXT NOT NULL,
  "actionTaken" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CqiRecord_chairmanId_idx" ON "CqiRecord"("chairmanId");
CREATE INDEX IF NOT EXISTS "CqiRecord_batchId_idx" ON "CqiRecord"("batchId");
CREATE INDEX IF NOT EXISTS "CqiRecord_courseId_idx" ON "CqiRecord"("courseId");
