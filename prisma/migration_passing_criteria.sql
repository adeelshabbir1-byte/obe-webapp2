-- Run in Supabase SQL Editor. Adds PassingCriteria — OMC-configurable
-- CLO/PLO attainment threshold per institution, defaulting to 50% for
-- both if never set. Used everywhere pass/fail is computed: Result Mate,
-- CLO/PLO Pass Rates, Program Attainment Analytics, and transcripts.

CREATE TABLE IF NOT EXISTS "PassingCriteria" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "chairmanId" TEXT NOT NULL UNIQUE,
  "cloPassingPct" INTEGER NOT NULL DEFAULT 50,
  "ploPassingPct" INTEGER NOT NULL DEFAULT 50
);
