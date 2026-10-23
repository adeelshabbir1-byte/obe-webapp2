-- One approvals inbox: delegation of approvals for a date range, reminder / escalation settings per kind of approval,
-- and a log of reminders sent (so each goes once). Safe to run more than once.
CREATE TABLE IF NOT EXISTS "ApprovalDelegation" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "fromUserId" TEXT NOT NULL, "toUserId" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL, "endDate" TIMESTAMP(3) NOT NULL, "note" TEXT, "revokedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ApprovalDelegation_fromUserId_idx" ON "ApprovalDelegation" ("fromUserId");
CREATE INDEX IF NOT EXISTS "ApprovalDelegation_toUserId_idx" ON "ApprovalDelegation" ("toUserId");
CREATE TABLE IF NOT EXISTS "ApprovalSetting" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "kind" TEXT NOT NULL, "remindAfterDays" INTEGER NOT NULL DEFAULT 3,
  "escalateAfterDays" INTEGER NOT NULL DEFAULT 7, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ApprovalSetting_chairmanId_kind_key" ON "ApprovalSetting" ("chairmanId", "kind");
CREATE TABLE IF NOT EXISTS "ApprovalNudge" (
  "id" TEXT PRIMARY KEY, "itemKey" TEXT NOT NULL, "userId" TEXT NOT NULL, "level" TEXT NOT NULL, "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ApprovalNudge_itemKey_userId_level_key" ON "ApprovalNudge" ("itemKey", "userId", "level");
SELECT 'done' AS result;
