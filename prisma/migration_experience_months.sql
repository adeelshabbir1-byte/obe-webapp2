-- Months on work-experience entries, so years of experience are worked out to the month.
ALTER TABLE "FacultyRecord" ADD COLUMN IF NOT EXISTS "startMonth" INTEGER;
ALTER TABLE "FacultyRecord" ADD COLUMN IF NOT EXISTS "endMonth" INTEGER;
