-- Production hardening: request counters for rate limits (password reset, Report a problem, public endpoints), the
-- results of the monthly backup restore drill (shown in System Health), and each institute's data-retention setting
-- (default: keep everything; nothing is deleted without the Super Admin's confirmation). Side tables only; safe to run
-- more than once.
CREATE TABLE IF NOT EXISTS "RateLimitHit" (
  "id" BIGSERIAL PRIMARY KEY, "key" TEXT NOT NULL, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "RateLimitHit_key_at_idx" ON "RateLimitHit"("key", "at");

CREATE TABLE IF NOT EXISTS "RestoreDrill" (
  "id" TEXT PRIMARY KEY, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "passed" BOOLEAN NOT NULL,
  "source" TEXT, "summary" TEXT, "detailJson" TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS "RestoreDrill_at_idx" ON "RestoreDrill"("at");

CREATE TABLE IF NOT EXISTS "PrivacySetting" (
  "chairmanId" TEXT PRIMARY KEY, "inactiveUserMonths" INTEGER, "graduatedDetailYears" INTEGER,
  "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
