-- Recognition layer: semester badges for teachers, and department goals everyone can see.
CREATE TABLE IF NOT EXISTS "RecognitionBadge" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "term" TEXT NOT NULL,
  "badgeKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "reason" TEXT,
  "awardedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("userId", "term", "badgeKey", "title")
);
CREATE INDEX IF NOT EXISTS "RecognitionBadge_chairmanId_term_idx" ON "RecognitionBadge"("chairmanId", "term");
CREATE TABLE IF NOT EXISTS "RecognitionGoal" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "departmentId" TEXT,
  "title" TEXT NOT NULL,
  "metric" TEXT NOT NULL,
  "targetPct" INTEGER NOT NULL DEFAULT 100,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "RecognitionGoal_chairmanId_idx" ON "RecognitionGoal"("chairmanId");
SELECT 'done' AS result;
