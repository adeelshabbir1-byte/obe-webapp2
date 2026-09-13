-- Run in Supabase SQL Editor. Adds the "closing the loop" mechanism:
-- structured source-linking and before/after verification on CqiRecord,
-- and PEO-mapping on survey questions (alongside the existing PLO mapping).

ALTER TABLE "CqiRecord" ADD COLUMN IF NOT EXISTS "sourceType" TEXT;
ALTER TABLE "CqiRecord" ADD COLUMN IF NOT EXISTS "sourceReference" TEXT;
ALTER TABLE "CqiRecord" ADD COLUMN IF NOT EXISTS "metricBefore" DOUBLE PRECISION;
ALTER TABLE "CqiRecord" ADD COLUMN IF NOT EXISTS "metricAfter" DOUBLE PRECISION;
ALTER TABLE "CqiRecord" ADD COLUMN IF NOT EXISTS "verifiedById" TEXT;
ALTER TABLE "CqiRecord" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3);

ALTER TABLE "SurveyQuestion" ADD COLUMN IF NOT EXISTS "mappedPeoLabel" TEXT;
