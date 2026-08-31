-- Run in Supabase SQL Editor. Adds the ability for each CLO to map to one of
-- the 10 HEC PLOs already seeded (spec's CLO-PLO mapping requirement).

ALTER TABLE "CLO"
  ADD COLUMN IF NOT EXISTS "mappedPloNumber" INTEGER;
