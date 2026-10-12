-- Short leave (a few days) and how each class in it is covered: substitute teacher, make-up class, or cancelled.
CREATE TABLE IF NOT EXISTS "ShortLeave" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "chairmanId" TEXT NOT NULL,
  "fromDate" TIMESTAMP(3) NOT NULL,
  "toDate" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "approverId" TEXT,
  "decidedAt" TIMESTAMP(3),
  "decisionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ShortLeave_chairmanId_idx" ON "ShortLeave"("chairmanId");
CREATE INDEX IF NOT EXISTS "ShortLeave_userId_idx" ON "ShortLeave"("userId");
CREATE TABLE IF NOT EXISTS "SubstituteClass" (
  "id" TEXT PRIMARY KEY,
  "leaveId" TEXT NOT NULL,
  "chairmanId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "entryId" TEXT NOT NULL,
  "courseCode" TEXT NOT NULL,
  "courseTitle" TEXT NOT NULL,
  "sectionLabel" TEXT NOT NULL,
  "timeLabel" TEXT NOT NULL,
  "roomName" TEXT NOT NULL,
  "originalId" TEXT NOT NULL,
  "plan" TEXT NOT NULL DEFAULT 'SUBSTITUTE',
  "substituteId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'NEEDED',
  "makeupDate" TIMESTAMP(3),
  "topic" TEXT,
  "note" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("leaveId", "entryId", "date")
);
CREATE INDEX IF NOT EXISTS "SubstituteClass_chairmanId_date_idx" ON "SubstituteClass"("chairmanId", "date");
CREATE INDEX IF NOT EXISTS "SubstituteClass_substituteId_idx" ON "SubstituteClass"("substituteId");
SELECT 'done' AS result;
