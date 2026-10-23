-- Prompt 3 batch 5: campuses, fee settings and online payment claims, Moodle link.
CREATE TABLE IF NOT EXISTS "Campus" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "city" TEXT,
  "code" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Campus_chairmanId_idx" ON "Campus"("chairmanId");
-- Which campus a batch, room or staff member belongs to (kind = BATCH | ROOM | USER). No row = main campus.
CREATE TABLE IF NOT EXISTS "CampusLink" (
  "kind" TEXT NOT NULL,
  "refId" TEXT NOT NULL,
  "campusId" TEXT NOT NULL,
  PRIMARY KEY ("kind","refId")
);
CREATE INDEX IF NOT EXISTS "CampusLink_campusId_idx" ON "CampusLink"("campusId");

CREATE TABLE IF NOT EXISTS "FinanceSetting" (
  "chairmanId" TEXT PRIMARY KEY,
  "bankJson" TEXT NOT NULL DEFAULT '{}',
  "blockAdmitCard" BOOLEAN NOT NULL DEFAULT false,
  "blockRegistration" BOOLEAN NOT NULL DEFAULT false,
  "blockDegree" BOOLEAN NOT NULL DEFAULT true,
  "minDue" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- A student's "I have paid" (bank, JazzCash, Easypaisa, 1Bill): Finance verifies it and the payment is posted.
CREATE TABLE IF NOT EXISTS "PaymentClaim" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "method" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "paidOn" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "note" TEXT,
  "decidedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PaymentClaim_chairmanId_status_idx" ON "PaymentClaim"("chairmanId","status");
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentClaim_method_reference_key" ON "PaymentClaim"("method","reference");

CREATE TABLE IF NOT EXISTS "LmsConfig" (
  "chairmanId" TEXT PRIMARY KEY,
  "moodleUrl" TEXT,
  "moodleToken" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "LmsCourseLink" (
  "courseId" TEXT PRIMARY KEY,
  "moodleCourseId" INTEGER NOT NULL,
  "lastSyncAt" TIMESTAMP(3)
);
