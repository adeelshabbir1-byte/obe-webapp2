-- Plagiarism records: the similarity report (e.g. Turnitin) of each final year project, thesis or research paper,
-- its similarity %, the HEC threshold, the decision and the action taken. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "PlagiarismRecord" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "program" TEXT,
  "authors" TEXT NOT NULL,
  "fypGroupId" TEXT,
  "supervisorId" TEXT,
  "tool" TEXT NOT NULL DEFAULT 'Turnitin',
  "similarityPct" DOUBLE PRECISION NOT NULL,
  "singleSourcePct" DOUBLE PRECISION,
  "thresholdPct" DOUBLE PRECISION NOT NULL DEFAULT 19,
  "decision" TEXT NOT NULL DEFAULT 'ACCEPTED',
  "actionTaken" TEXT,
  "reportFileName" TEXT,
  "reportMime" TEXT,
  "reportData" TEXT,
  "checkedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PlagiarismRecord_chairmanId_idx" ON "PlagiarismRecord" ("chairmanId");
SELECT 'done' AS result;
