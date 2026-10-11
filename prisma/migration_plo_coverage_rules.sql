-- OMC assessment-coverage rules per course type (PLO marks %, PLO assessment items, CLO balance).
ALTER TABLE "WeightPolicy" ADD COLUMN IF NOT EXISTS "ploMinPct" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WeightPolicy" ADD COLUMN IF NOT EXISTS "ploMinItems" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WeightPolicy" ADD COLUMN IF NOT EXISTS "cloSpreadMax" INTEGER NOT NULL DEFAULT 7;
