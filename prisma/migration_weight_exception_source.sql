-- Run in Supabase SQL Editor. Adds a "source" column to WeightExceptionRequest
-- so SE's and Instructor's weight-change requests are tracked separately
-- (previously only one exception request could exist per course at all).

ALTER TABLE "WeightExceptionRequest" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'SE';

DROP INDEX IF EXISTS "WeightExceptionRequest_courseId_key";
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'WeightExceptionRequest' AND con.contype = 'u'
      AND (SELECT array_agg(a.attname ORDER BY a.attnum)::text[] FROM pg_attribute a WHERE a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)) = ARRAY['courseId']::text[]
  LOOP EXECUTE format('ALTER TABLE "WeightExceptionRequest" DROP CONSTRAINT %I', r.conname); END LOOP;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "WeightExceptionRequest_courseId_source_key" ON "WeightExceptionRequest"("courseId", "source");
