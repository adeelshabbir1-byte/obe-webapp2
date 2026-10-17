-- SMS / WhatsApp notifications: the institute's gateway settings, students' alert numbers, and a send log. Safe to re-run.
CREATE TABLE IF NOT EXISTS "MessagingConfig" ("chairmanId" TEXT PRIMARY KEY, "smsProvider" TEXT NOT NULL DEFAULT 'NONE', "smsJson" TEXT NOT NULL DEFAULT '{}', "waProvider" TEXT NOT NULL DEFAULT 'NONE', "waJson" TEXT NOT NULL DEFAULT '{}', "kindsJson" TEXT NOT NULL DEFAULT '[]', "dailyLimit" INTEGER NOT NULL DEFAULT 500, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS "StudentContact" ("studentId" TEXT PRIMARY KEY, "phone" TEXT, "guardianPhone" TEXT, "whatsapp" BOOLEAN NOT NULL DEFAULT true, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS "MessageLog" ("id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "channel" TEXT NOT NULL, "to" TEXT NOT NULL, "body" TEXT NOT NULL, "status" TEXT NOT NULL, "error" TEXT, "kind" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "MessageLog_chairmanId_createdAt_idx" ON "MessageLog" ("chairmanId", "createdAt");
SELECT 'done' AS result;
