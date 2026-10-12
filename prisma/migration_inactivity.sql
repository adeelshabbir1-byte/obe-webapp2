-- Sign-in watch: when each person last used the app, each boss's limit (working days), and alerts already sent.
-- New tables only; nothing existing is changed.
CREATE TABLE IF NOT EXISTS "UserActivity" (
  "userId" TEXT PRIMARY KEY,
  "lastSeenAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE IF NOT EXISTS "InactivityPolicy" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "bossId" TEXT NOT NULL,
  "workingDays" INTEGER NOT NULL DEFAULT 3,
  "offDaysJson" TEXT NOT NULL DEFAULT '[0,6]',
  "exemptIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "InactivityPolicy_bossId_key" ON "InactivityPolicy"("bossId");
CREATE INDEX IF NOT EXISTS "InactivityPolicy_chairmanId_idx" ON "InactivityPolicy"("chairmanId");
CREATE TABLE IF NOT EXISTS "InactivityAlert" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "bossId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  "workingDays" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "InactivityAlert_bossId_userId_lastSeenAt_key" ON "InactivityAlert"("bossId", "userId", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "InactivityAlert_userId_idx" ON "InactivityAlert"("userId");
SELECT 'done' AS result;
