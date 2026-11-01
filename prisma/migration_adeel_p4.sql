-- Adeel prompt part 4: one delegation engine (chosen tasks / approvals / acting, with scope, period and "may pass on"),
-- end-of-term archive snapshots, and amendments to archived terms. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "TaskDelegation" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "kind" TEXT NOT NULL, "fromUserId" TEXT NOT NULL, "toUserId" TEXT NOT NULL,
  "roleLabel" TEXT NOT NULL, "tasksJson" TEXT NOT NULL DEFAULT '[]', "scopeJson" TEXT NOT NULL DEFAULT '{}', "maxLeaveDays" INTEGER,
  "startAt" TIMESTAMP(3) NOT NULL, "endAt" TIMESTAMP(3) NOT NULL, "mayPassOn" BOOLEAN NOT NULL DEFAULT false,
  "shared" BOOLEAN NOT NULL DEFAULT false, "parentId" TEXT, "note" TEXT, "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "TaskDelegation_to_idx" ON "TaskDelegation"("toUserId");
CREATE INDEX IF NOT EXISTS "TaskDelegation_from_idx" ON "TaskDelegation"("fromUserId");
CREATE TABLE IF NOT EXISTS "TermArchive" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "term" TEXT NOT NULL, "courseId" TEXT NOT NULL, "dataJson" TEXT NOT NULL,
  "byId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "TermArchive_course_term" ON "TermArchive"("courseId", "term");
CREATE INDEX IF NOT EXISTS "TermArchive_chairman_idx" ON "TermArchive"("chairmanId", "term");
CREATE TABLE IF NOT EXISTS "ArchiveAmendment" (
  "id" TEXT PRIMARY KEY, "courseId" TEXT NOT NULL, "term" TEXT NOT NULL, "reason" TEXT NOT NULL, "requestedById" TEXT NOT NULL,
  "approvedById" TEXT, "approvedAt" TIMESTAMP(3), "openUntil" TIMESTAMP(3), "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ArchiveAmendment_course_idx" ON "ArchiveAmendment"("courseId");
