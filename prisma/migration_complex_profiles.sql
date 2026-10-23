-- Complex problems beyond single assessments: a final year project group or a lab task tagged with complex-problem
-- attributes (WP1-WP7 / EA1-EA5) and knowledge-profile areas (WK1-WK8 / CK areas). Assessments keep their tags in
-- "ComplexTag" (migration_teaching_extras.sql), which now also holds knowledge areas. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "ComplexTarget" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "refId" TEXT NOT NULL,
  "courseId" TEXT,
  "attrsJson" TEXT NOT NULL DEFAULT '[]',
  "note" TEXT,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ComplexTarget_kind_refId_key" ON "ComplexTarget" ("kind", "refId");
CREATE INDEX IF NOT EXISTS "ComplexTarget_chairmanId_idx" ON "ComplexTarget" ("chairmanId");
SELECT 'done' AS result;
