-- Exam branch: staff who run exams for the Institute Head, the duty pool from Program Leads, faculty preferences,
-- duty swaps, and when duties were published. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "ExamStaff" ("id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "userId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX IF NOT EXISTS "ExamStaff_chairmanId_userId_key" ON "ExamStaff" ("chairmanId", "userId");
CREATE TABLE IF NOT EXISTS "ExamDutyPool" ("id" TEXT PRIMARY KEY, "sessionId" TEXT NOT NULL, "userId" TEXT NOT NULL, "addedById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX IF NOT EXISTS "ExamDutyPool_sessionId_userId_key" ON "ExamDutyPool" ("sessionId", "userId");
CREATE TABLE IF NOT EXISTS "ExamDutyPref" ("id" TEXT PRIMARY KEY, "sessionId" TEXT NOT NULL, "userId" TEXT NOT NULL, "slotsJson" TEXT NOT NULL DEFAULT '[]', "maxPerDay" INTEGER NOT NULL DEFAULT 1, "note" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX IF NOT EXISTS "ExamDutyPref_sessionId_userId_key" ON "ExamDutyPref" ("sessionId", "userId");
CREATE TABLE IF NOT EXISTS "DutySwap" ("id" TEXT PRIMARY KEY, "sessionId" TEXT NOT NULL, "paperId" TEXT NOT NULL, "roomId" TEXT NOT NULL, "fromUserId" TEXT NOT NULL, "toUserId" TEXT NOT NULL, "status" TEXT NOT NULL, "note" TEXT, "decidedById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "decidedAt" TIMESTAMP(3));
CREATE INDEX IF NOT EXISTS "DutySwap_sessionId_idx" ON "DutySwap" ("sessionId");
CREATE TABLE IF NOT EXISTS "ExamPublishLog" ("sessionId" TEXT PRIMARY KEY, "publishedAt" TIMESTAMP(3) NOT NULL);
SELECT 'done' AS result;
