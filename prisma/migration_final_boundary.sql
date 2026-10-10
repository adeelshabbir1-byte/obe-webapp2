-- OMC guidance on the Final paper split (before vs after midterm) and the course midterm week. Safe to run more than once.
ALTER TABLE "WeightPolicy" ADD COLUMN IF NOT EXISTS "finalBeforeMidtermPct" INTEGER;
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "midtermWeek" INTEGER;
