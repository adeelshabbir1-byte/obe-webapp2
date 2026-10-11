-- OMC minimum number of lecture topics per CLO and per PLO (replaces the fixed "3 topics per CLO" rule).
ALTER TABLE "WeightPolicy" ADD COLUMN IF NOT EXISTS "cloMinTopics" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "WeightPolicy" ADD COLUMN IF NOT EXISTS "ploMinTopics" INTEGER NOT NULL DEFAULT 0;
