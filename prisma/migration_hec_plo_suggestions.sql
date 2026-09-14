-- Run in Supabase SQL Editor. Adds HecPloSuggestion — HEC's own suggested
-- course-to-PLO mapping, used by the "Auto-Map from HEC" button to
-- bulk-create real CoursePloMapping records for a batch.

CREATE TABLE IF NOT EXISTS "HecPloSuggestion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "courseCode" TEXT NOT NULL,
  "ploNumber" INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "HecPloSuggestion_courseCode_ploNumber_key" ON "HecPloSuggestion"("courseCode", "ploNumber");
CREATE INDEX IF NOT EXISTS "HecPloSuggestion_courseCode_idx" ON "HecPloSuggestion"("courseCode");
