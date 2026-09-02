-- Run in Supabase SQL Editor. Removes PLO rows that the earlier backfill
-- couldn't match to any batch (batchId is NULL), along with anything that
-- references them, so they stop breaking every PLO query.

-- See how many there are and what they look like, for your own awareness:
SELECT id, number, title FROM "PLO" WHERE "batchId" IS NULL;

-- Clean up dependents first (foreign keys), then the orphaned PLOs themselves.
UPDATE "CLO" SET "mappedPloId" = NULL, "ploContributionPct" = NULL
  WHERE "mappedPloId" IN (SELECT id FROM "PLO" WHERE "batchId" IS NULL);
DELETE FROM "CoursePloMapping" WHERE "ploId" IN (SELECT id FROM "PLO" WHERE "batchId" IS NULL);
DELETE FROM "PLO" WHERE "batchId" IS NULL;

-- Confirm none remain
SELECT count(*) AS remaining_orphaned_plos FROM "PLO" WHERE "batchId" IS NULL;
