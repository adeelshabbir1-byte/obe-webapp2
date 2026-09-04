-- Run in Supabase SQL Editor. Converts midterm/final from single dates to
-- date ranges (they span a full exam week), on both SemesterDates (the
-- degree-wide default) and Course (the per-course override).

ALTER TABLE "SemesterDates"
  ADD COLUMN IF NOT EXISTS "midtermStartDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "midtermEndDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "finalStartDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "finalEndDate" TIMESTAMP(3);

-- Best-effort carry-over of any previously-set single dates into the new
-- start-date columns (end date left blank — old data had no range info).
UPDATE "SemesterDates" SET "midtermStartDate" = "midtermDate" WHERE "midtermDate" IS NOT NULL AND "midtermStartDate" IS NULL;
UPDATE "SemesterDates" SET "finalStartDate" = "finalDate" WHERE "finalDate" IS NOT NULL AND "finalStartDate" IS NULL;
ALTER TABLE "SemesterDates" DROP COLUMN IF EXISTS "midtermDate";
ALTER TABLE "SemesterDates" DROP COLUMN IF EXISTS "finalDate";

ALTER TABLE "Course"
  ADD COLUMN IF NOT EXISTS "midtermStartDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "midtermEndDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "finalStartDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "finalEndDate" TIMESTAMP(3);

UPDATE "Course" SET "midtermStartDate" = "midtermDate" WHERE "midtermDate" IS NOT NULL AND "midtermStartDate" IS NULL;
UPDATE "Course" SET "finalStartDate" = "finalDate" WHERE "finalDate" IS NOT NULL AND "finalStartDate" IS NULL;
ALTER TABLE "Course" DROP COLUMN IF EXISTS "midtermDate";
ALTER TABLE "Course" DROP COLUMN IF EXISTS "finalDate";
