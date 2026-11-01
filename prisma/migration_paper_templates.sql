-- Part 6 build C: paper templates set by the Controller (institute, department / program variants, per exam type), the
-- values filled on a paper and every edit of them, and the read-only access log of official papers. Safe to run twice.
CREATE TABLE IF NOT EXISTS "PaperTemplate" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "scopeId" TEXT,
  "examType" TEXT NOT NULL DEFAULT 'ALL',
  "configJson" TEXT NOT NULL DEFAULT '{}',
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PaperTemplate_chairmanId_idx" ON "PaperTemplate" ("chairmanId");

CREATE TABLE IF NOT EXISTS "PaperValues" (
  "paperId" TEXT PRIMARY KEY,
  "valuesJson" TEXT NOT NULL DEFAULT '{}',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "PaperFieldEdit" (
  "id" TEXT PRIMARY KEY,
  "paperId" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "oldValue" TEXT NOT NULL DEFAULT '',
  "newValue" TEXT NOT NULL DEFAULT '',
  "byId" TEXT NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PaperFieldEdit_paperId_idx" ON "PaperFieldEdit" ("paperId");

CREATE TABLE IF NOT EXISTS "PaperAccessLog" (
  "id" TEXT PRIMARY KEY,
  "paperId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PaperAccessLog_paperId_idx" ON "PaperAccessLog" ("paperId");

-- The access log is read-only: nobody (not even the application) can change or delete an entry.
CREATE OR REPLACE FUNCTION "paper_access_log_readonly"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'The paper access log is read-only';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "PaperAccessLog_readonly" ON "PaperAccessLog";
CREATE TRIGGER "PaperAccessLog_readonly" BEFORE UPDATE OR DELETE ON "PaperAccessLog" FOR EACH ROW EXECUTE FUNCTION "paper_access_log_readonly"();
