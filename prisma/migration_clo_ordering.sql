-- Run in Supabase SQL Editor. Adds CLO.orderIndex, and backfills it for any
-- existing CLOs based on their current code's natural sort order — without
-- this backfill, every existing row would default to orderIndex 0 and the
-- move-up/move-down buttons would think every CLO is both first and last.

ALTER TABLE "CLO" ADD COLUMN IF NOT EXISTS "orderIndex" INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "courseId", "source" ORDER BY "code" ASC) - 1 AS rn
  FROM "CLO"
)
UPDATE "CLO"
SET "orderIndex" = ranked.rn
FROM ranked
WHERE "CLO"."id" = ranked."id";

-- Also clean up existing messy codes ("CLO 1", "CLO1", "clo-1"...) into the
-- consistent "CLO-N" format, matching the new orderIndex — this is the same
-- inconsistency the auto-numbering feature exists to prevent going forward.
-- Two-phase update avoids tripping the @@unique([courseId, source, code])
-- constraint mid-rewrite.
UPDATE "CLO" SET "code" = 'TEMP-' || "id";
UPDATE "CLO" SET "code" = 'CLO-' || ("orderIndex" + 1);
