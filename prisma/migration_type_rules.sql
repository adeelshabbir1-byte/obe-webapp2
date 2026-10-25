-- Per course-type rules of a curriculum: pass / fail only (not in GPA) and "only for students from <track>" (e.g. Math
-- Deficiency for Pre-Medical entrants). Carried to every batch that imports the curriculum.
CREATE TABLE IF NOT EXISTS "CurriculumTypeRule" (
  "curriculumId" TEXT NOT NULL, "typeName" TEXT NOT NULL, "passFail" BOOLEAN NOT NULL DEFAULT FALSE, "onlyTrack" TEXT,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("curriculumId", "typeName")
);
