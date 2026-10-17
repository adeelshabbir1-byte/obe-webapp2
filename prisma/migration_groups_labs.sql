-- Project/lab groups, lab sessions with a CLO and rubric, rubric levels on lab marks. Safe to run more than once.
ALTER TABLE "LabManual" ADD COLUMN IF NOT EXISTS "cloId" TEXT;
ALTER TABLE "LabManual" ADD COLUMN IF NOT EXISTS "criteriaJson" TEXT;
ALTER TABLE "LabMark" ADD COLUMN IF NOT EXISTS "levelsJson" TEXT;
CREATE TABLE IF NOT EXISTS "WorkGroup" (
  "id" TEXT PRIMARY KEY, "courseId" TEXT NOT NULL, "name" TEXT NOT NULL, "title" TEXT, "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "WorkGroup_courseId_idx" ON "WorkGroup" ("courseId");
CREATE TABLE IF NOT EXISTS "WorkGroupMember" ("id" TEXT PRIMARY KEY, "groupId" TEXT NOT NULL, "studentId" TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS "WorkGroupMember_groupId_studentId_key" ON "WorkGroupMember" ("groupId", "studentId");
CREATE INDEX IF NOT EXISTS "WorkGroupMember_studentId_idx" ON "WorkGroupMember" ("studentId");
SELECT 'done' AS result;
