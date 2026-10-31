-- Collaborative question bank and peer-reviewed exam papers: each bank question's required metadata (lecture topic,
-- difficulty, CLOs, rubric / options, code, diagram), each section teacher's draft paper, 5-star peer ratings, the
-- consensus paper the Course Lead finalises and publishes, and the exam blueprint (difficulty ratio, CLO spread).
-- Side tables only; safe to run more than once.
CREATE TABLE IF NOT EXISTS "QbMeta" (
  "itemId" TEXT PRIMARY KEY, "lectureNumber" INTEGER, "week" INTEGER, "topic" TEXT NOT NULL DEFAULT '',
  "difficulty" TEXT NOT NULL DEFAULT 'MEDIUM', "cloCodesJson" TEXT NOT NULL DEFAULT '[]', "rubric" TEXT, "optionsJson" TEXT,
  "correctIndex" INTEGER, "codeSnippet" TEXT, "imageData" TEXT, "imageType" TEXT, "duplicateOfId" TEXT,
  "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "ExamDraft" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "teamKey" TEXT NOT NULL, "examType" TEXT NOT NULL, "authorId" TEXT NOT NULL,
  "itemIdsJson" TEXT NOT NULL DEFAULT '[]', "status" TEXT NOT NULL DEFAULT 'DRAFT', "checkJson" TEXT, "submittedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ExamDraft_key" ON "ExamDraft"("chairmanId", "teamKey", "examType", "authorId");
CREATE TABLE IF NOT EXISTS "QbRating" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "teamKey" TEXT NOT NULL, "examType" TEXT NOT NULL, "itemId" TEXT NOT NULL,
  "raterId" TEXT NOT NULL, "stars" INTEGER NOT NULL, "comment" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "QbRating_key" ON "QbRating"("teamKey", "examType", "itemId", "raterId");
CREATE INDEX IF NOT EXISTS "QbRating_round_idx" ON "QbRating"("chairmanId", "teamKey", "examType");
CREATE TABLE IF NOT EXISTS "ExamFinal" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "teamKey" TEXT NOT NULL, "examType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN', "decisionsJson" TEXT NOT NULL DEFAULT '{}', "extraJson" TEXT NOT NULL DEFAULT '[]',
  "removedJson" TEXT NOT NULL DEFAULT '[]', "editsJson" TEXT NOT NULL DEFAULT '{}', "paperJson" TEXT, "leadCourseId" TEXT,
  "publishedAt" TIMESTAMP(3), "publishedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ExamFinal_key" ON "ExamFinal"("chairmanId", "teamKey", "examType");
CREATE TABLE IF NOT EXISTS "ExamBlueprint" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "examType" TEXT NOT NULL, "easyPct" DOUBLE PRECISION NOT NULL DEFAULT 20,
  "mediumPct" DOUBLE PRECISION NOT NULL DEFAULT 60, "hardPct" DOUBLE PRECISION NOT NULL DEFAULT 20,
  "tolerancePct" DOUBLE PRECISION NOT NULL DEFAULT 10, "minCloPct" DOUBLE PRECISION NOT NULL DEFAULT 10,
  "maxCloPct" DOUBLE PRECISION NOT NULL DEFAULT 50, "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ExamBlueprint_key" ON "ExamBlueprint"("chairmanId", "examType");
