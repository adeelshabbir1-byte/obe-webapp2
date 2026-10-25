-- Degree plan history: versions (lock / unlock / advisor hand-over), every course move with its reason, and comments.
CREATE TABLE IF NOT EXISTS "PlanVersion" (
  "id" TEXT PRIMARY KEY, "studentId" TEXT NOT NULL, "kind" TEXT NOT NULL, "byId" TEXT NOT NULL, "byName" TEXT NOT NULL DEFAULT '',
  "reason" TEXT, "note" TEXT, "itemsJson" TEXT NOT NULL, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PlanVersion_studentId_idx" ON "PlanVersion"("studentId");
CREATE TABLE IF NOT EXISTS "PlanMove" (
  "id" TEXT PRIMARY KEY, "studentId" TEXT NOT NULL, "courseId" TEXT NOT NULL, "code" TEXT NOT NULL DEFAULT '', "fromSem" INTEGER, "toSem" INTEGER NOT NULL,
  "byId" TEXT NOT NULL, "byName" TEXT NOT NULL DEFAULT '', "reason" TEXT, "note" TEXT, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PlanMove_studentId_idx" ON "PlanMove"("studentId");
CREATE TABLE IF NOT EXISTS "PlanComment" (
  "id" TEXT PRIMARY KEY, "studentId" TEXT NOT NULL, "byId" TEXT NOT NULL, "byName" TEXT NOT NULL DEFAULT '', "byStudent" BOOLEAN NOT NULL DEFAULT FALSE,
  "body" TEXT NOT NULL, "courseId" TEXT, "versionId" TEXT, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PlanComment_studentId_idx" ON "PlanComment"("studentId");
