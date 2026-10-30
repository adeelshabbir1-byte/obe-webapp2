-- Course homes and PREFIX-YCN codes: each department's chain table, confirmed "same course" matches, drafts the
-- Dean / Chairman / Program Lead save and the BOS approves, the approved homes and codes (with old codes kept as
-- aliases), and each department's lead program (the content-sync base of its common courses). Side tables only;
-- safe to run more than once.
CREATE TABLE IF NOT EXISTS "CodeChain" (
  "chairmanId" TEXT NOT NULL, "departmentId" TEXT NOT NULL, "chain" INTEGER NOT NULL, "name" TEXT NOT NULL,
  PRIMARY KEY ("chairmanId", "departmentId", "chain")
);
CREATE TABLE IF NOT EXISTS "CourseKeyMerge" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "fromKey" TEXT NOT NULL, "toKey" TEXT NOT NULL, "reason" TEXT, "byId" TEXT NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CourseKeyMerge_from_key" ON "CourseKeyMerge"("chairmanId", "fromKey");
CREATE TABLE IF NOT EXISTS "CourseHomeDraft" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "entriesJson" TEXT NOT NULL DEFAULT '{}', "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "cmtItemId" TEXT, "note" TEXT, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "sentAt" TIMESTAMP(3), "decidedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "CourseHomeDraft_chairman_idx" ON "CourseHomeDraft"("chairmanId", "status");
CREATE TABLE IF NOT EXISTS "CourseHome" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "key" TEXT NOT NULL, "title" TEXT NOT NULL, "isLab" BOOLEAN NOT NULL DEFAULT false,
  "level" TEXT NOT NULL, "departmentId" TEXT, "program" TEXT, "track" TEXT, "chain" INTEGER, "code" TEXT,
  "aliasesJson" TEXT NOT NULL DEFAULT '[]', "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "draftId" TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS "CourseHome_key" ON "CourseHome"("chairmanId", "key");
CREATE INDEX IF NOT EXISTS "CourseHome_code_idx" ON "CourseHome"("chairmanId", "code");
CREATE TABLE IF NOT EXISTS "DeptLeadProgram" (
  "chairmanId" TEXT NOT NULL, "departmentId" TEXT NOT NULL, "program" TEXT NOT NULL, "setById" TEXT,
  PRIMARY KEY ("chairmanId", "departmentId")
);
