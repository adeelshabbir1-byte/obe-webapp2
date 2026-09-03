-- Run in Supabase SQL Editor. This was an INTERMEDIATE step (PLO scoped by
-- coordinator+degreeProgram) later superseded by migration_plo_batch_scope.sql
-- (PLO scoped by batch directly). Wrapped so it's a safe no-op if the
-- database has already moved past this stage (degreeProgram column gone).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PLO' AND column_name = 'degreeProgram') THEN

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

  END IF;
END $$;

-- Drop whatever the old (coordinatorId, number) unique constraint/index is
-- called, as either a formal constraint or a plain index — safe even if
-- already gone.
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

-- Only (re)create the intermediate degreeProgram-based unique index if that
-- column still exists — once batch_scope has dropped it, this must NOT run,
-- since duplicate (coordinatorId, degreeProgram, number) rows now legitimately
-- exist across different batches of the same degree.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PLO' AND column_name = 'degreeProgram') THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS "PLO_coordinatorId_degreeProgram_number_key" ON "PLO"("coordinatorId", "degreeProgram", "number")';
  END IF;
END $$;

-- Add COURSE_ASSIGNER to the UserRole enum if it's somehow still missing
-- (the IF NOT EXISTS clause makes this safe to run again even if already applied).
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'COURSE_ASSIGNER';
