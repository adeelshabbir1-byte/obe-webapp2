-- Search everywhere (Prompt 2 item 2): trigram indexes so "contains" searches stay fast, and each person's recent searches.
-- Safe to run more than once. On Supabase pg_trgm is available; it is created in the public schema if missing.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "Student_name_trgm" ON "Student" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Student_rollNumber_trgm" ON "Student" USING gin ("rollNumber" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "User_name_trgm" ON "User" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Course_code_trgm" ON "Course" USING gin ("code" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Course_title_trgm" ON "Course" USING gin ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Batch_degreeProgram_trgm" ON "Batch" USING gin ("degreeProgram" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "MeetingMinutes_title_trgm" ON "MeetingMinutes" USING gin ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "HelpArticle_title_trgm" ON "HelpArticle" USING gin ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "EvidenceFile_title_trgm" ON "EvidenceFile" USING gin ("title" gin_trgm_ops);
CREATE TABLE IF NOT EXISTS "SearchHistory" (
  "id" TEXT PRIMARY KEY, "ownerKey" TEXT NOT NULL, "query" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SearchHistory_ownerKey_createdAt_idx" ON "SearchHistory" ("ownerKey", "createdAt");
SELECT 'done' AS result;
