-- Project / Lab mapped directly to a CLO, and split into parts (one per CLO). Safe to run more than once.
ALTER TABLE "AssessmentInstrument" ADD COLUMN IF NOT EXISTS "cloId" TEXT;
ALTER TABLE "AssessmentInstrument" ADD COLUMN IF NOT EXISTS "partOfId" TEXT;
CREATE INDEX IF NOT EXISTS "AssessmentInstrument_partOfId_idx" ON "AssessmentInstrument" ("partOfId");
SELECT 'done' AS result;
