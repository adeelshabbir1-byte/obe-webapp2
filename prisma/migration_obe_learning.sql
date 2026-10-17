-- OBE learning (lessons, practice question bank) and the optional OBE Assistant chat. Safe to run more than once.
ALTER TABLE "AiConfig" ADD COLUMN IF NOT EXISTS "chatbotEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AiConfig" ADD COLUMN IF NOT EXISTS "chatbotDailyLimit" INTEGER NOT NULL DEFAULT 20;
CREATE TABLE IF NOT EXISTS "ObeProgress" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "key" TEXT NOT NULL, "score" INTEGER NOT NULL, "total" INTEGER NOT NULL,
  "passed" BOOLEAN NOT NULL DEFAULT false, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ObeProgress_userId_key_key" ON "ObeProgress" ("userId", "key");
CREATE TABLE IF NOT EXISTS "ObeQuestion" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT, "masterCourseId" TEXT, "courseCode" TEXT, "prompt" TEXT NOT NULL, "optionsJson" TEXT NOT NULL,
  "answer" INTEGER NOT NULL, "explanation" TEXT, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ObeQuestion_masterCourseId_idx" ON "ObeQuestion" ("masterCourseId");
CREATE INDEX IF NOT EXISTS "ObeQuestion_chairmanId_idx" ON "ObeQuestion" ("chairmanId");
CREATE TABLE IF NOT EXISTS "ObeChatLog" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "chairmanId" TEXT NOT NULL, "courseId" TEXT, "question" TEXT NOT NULL, "answer" TEXT NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ObeChatLog_userId_at_idx" ON "ObeChatLog" ("userId", "at");
CREATE INDEX IF NOT EXISTS "ObeChatLog_chairmanId_idx" ON "ObeChatLog" ("chairmanId");
SELECT 'done' AS result;
