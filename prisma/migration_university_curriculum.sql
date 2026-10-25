-- University curriculum as the main copy: revisions, the university's plan per curriculum course, which revision each
-- batch started from, and changes moving SE / OMC → BOS → OMC forwards. Also a curriculum's source badge, and
-- "(your copy)" taken out of curriculum names.
CREATE TABLE IF NOT EXISTS "CurriculumRevision" (
  "id" TEXT PRIMARY KEY, "curriculumId" TEXT NOT NULL, "number" INTEGER NOT NULL, "note" TEXT NOT NULL DEFAULT '',
  "itemsJson" TEXT NOT NULL DEFAULT '[]', "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CurriculumRevision_curriculumId_number_key" ON "CurriculumRevision"("curriculumId", "number");
CREATE TABLE IF NOT EXISTS "UniversityCoursePlan" (
  "masterCourseId" TEXT PRIMARY KEY, "snapshotJson" TEXT NOT NULL, "revision" INTEGER NOT NULL DEFAULT 0, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "BatchCurriculumSource" (
  "batchId" TEXT PRIMARY KEY, "curriculumId" TEXT, "revision" INTEGER NOT NULL DEFAULT 0, "how" TEXT NOT NULL DEFAULT 'CURRICULUM',
  "fromBatchId" TEXT, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "CurriculumRecommendation" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "courseId" TEXT NOT NULL, "masterCourseId" TEXT, "curriculumId" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'SE_CHANGE', "summary" TEXT NOT NULL, "reason" TEXT, "snapshotJson" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OMC_REVIEW', "proposedById" TEXT NOT NULL, "omcById" TEXT, "bosMinutesId" TEXT, "bosItem" TEXT, "bosNote" TEXT,
  "revision" INTEGER, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CurriculumRecommendation_chairmanId_status_idx" ON "CurriculumRecommendation"("chairmanId", "status");
DO $$ BEGIN
  IF to_regclass('"CurriculumMeta"') IS NOT NULL THEN ALTER TABLE "CurriculumMeta" ADD COLUMN IF NOT EXISTS "sourceKind" TEXT; END IF;
  IF to_regclass('"MasterCurriculum"') IS NOT NULL THEN UPDATE "MasterCurriculum" SET "version" = TRIM(REPLACE("version", ' (your copy)', '')) WHERE "version" LIKE '%(your copy)%'; END IF;
END $$;
