-- Adeel prompt part 1: settings by scope (institute / department / program) with "who set it last", and small per-user
-- flags (What's new seen, digest choice, "waiting on someone else"). Safe to run more than once.
CREATE TABLE IF NOT EXISTS "ScopedSetting" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "scopeType" TEXT NOT NULL, "scopeId" TEXT NOT NULL, "key" TEXT NOT NULL,
  "value" TEXT NOT NULL, "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ScopedSetting_scope_key" ON "ScopedSetting"("chairmanId", "scopeType", "scopeId", "key");
CREATE TABLE IF NOT EXISTS "UserFlag" (
  "userId" TEXT NOT NULL, "key" TEXT NOT NULL, "value" TEXT NOT NULL, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("userId", "key")
);
