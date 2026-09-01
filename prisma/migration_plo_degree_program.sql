-- Run in Supabase SQL Editor. Adds degreeProgram to PLO, backfills existing
-- rows where possible, and replaces the old unique constraint/index with the
-- correct one. Finds the old one dynamically (by column match) rather than
-- guessing its exact name, since that's bitten us before.

ALTER TABLE "PLO" ADD COLUMN IF NOT EXISTS "degreeProgram" TEXT NOT NULL DEFAULT '';

-- Backfill: where a coordinator has exactly one distinct degree program
-- across their batches, assume existing PLOs belong to it.
UPDATE "PLO" p
SET "degreeProgram" = sub.only_degree
FROM (
  SELECT "coordinatorId", MIN("degreeProgram") AS only_degree
  FROM "Batch"
  GROUP BY "coordinatorId"
  HAVING COUNT(DISTINCT "degreeProgram") = 1
) sub
WHERE p."coordinatorId" = sub."coordinatorId" AND p."degreeProgram" = '';

-- Drop whatever the old (coordinatorId, number) unique constraint/index is
-- called, as either a formal constraint or a plain index.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'PLO' AND con.contype = 'u'
      AND (
        SELECT array_agg(a.attname ORDER BY a.attnum)::text[]
        FROM pg_attribute a
        WHERE a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
      ) = ARRAY['coordinatorId','number']::text[]
  LOOP
    EXECUTE format('ALTER TABLE "PLO" DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

DROP INDEX IF EXISTS "PLO_coordinatorId_number_key";

CREATE UNIQUE INDEX IF NOT EXISTS "PLO_coordinatorId_degreeProgram_number_key" ON "PLO"("coordinatorId", "degreeProgram", "number");

-- Add COURSE_ASSIGNER to the UserRole enum if it's somehow still missing
-- (the IF NOT EXISTS clause makes this safe to run again even if already applied).
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'COURSE_ASSIGNER';
