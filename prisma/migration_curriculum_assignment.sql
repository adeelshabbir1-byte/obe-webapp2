-- Super User assigns official master curricula to institutes (Chairmen).
CREATE TABLE IF NOT EXISTS "CurriculumAssignment" (
  "id" TEXT PRIMARY KEY,
  "curriculumId" TEXT NOT NULL REFERENCES "MasterCurriculum"("id") ON DELETE CASCADE,
  "chairmanId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "CurriculumAssignment_curriculumId_chairmanId_key" ON "CurriculumAssignment"("curriculumId", "chairmanId");
CREATE INDEX IF NOT EXISTS "CurriculumAssignment_chairmanId_idx" ON "CurriculumAssignment"("chairmanId");

-- Keep today's behaviour for what institutes already have: every existing official curriculum
-- is assigned to every existing Chairman. The newly added prospectus / Punjab University
-- curricula are deliberately NOT auto-assigned - the Super User assigns those.
INSERT INTO "CurriculumAssignment" ("id", "curriculumId", "chairmanId")
SELECT gen_random_uuid()::text, mc."id", u."id"
FROM "MasterCurriculum" mc CROSS JOIN "User" u
WHERE mc."chairmanId" IS NULL AND mc."parentCurriculumId" IS NULL
  AND u."role" = 'CHAIRMAN'
  AND mc."authority" NOT IN ('Prospectus 2024-25', 'University of the Punjab')
ON CONFLICT DO NOTHING;
