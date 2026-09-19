-- Run in Supabase SQL Editor. Adds CourseContentSyncGroup and
-- CourseContentSyncMember — a link (separate from CourseEquivalence)
-- where a Subject Expert's saved changes on one course automatically
-- propagate to every other linked course.

CREATE TABLE IF NOT EXISTS "CourseContentSyncGroup" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "chairmanId" TEXT NOT NULL REFERENCES "User"("id"),
  "createdById" TEXT,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CourseContentSyncGroup_chairmanId_idx" ON "CourseContentSyncGroup"("chairmanId");

CREATE TABLE IF NOT EXISTS "CourseContentSyncMember" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "groupId" TEXT NOT NULL REFERENCES "CourseContentSyncGroup"("id"),
  "courseId" TEXT NOT NULL UNIQUE REFERENCES "Course"("id"),
  "isBase" BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS "CourseContentSyncMember_groupId_idx" ON "CourseContentSyncMember"("groupId");
-- Enforces exactly one base course per group at the DB level too, not
-- just in application code.
CREATE UNIQUE INDEX IF NOT EXISTS "CourseContentSyncMember_one_base_per_group"
  ON "CourseContentSyncMember"("groupId") WHERE "isBase" = true;

-- Added later: linking courses no longer copies content immediately —
-- that was the actual source of "Accept All takes hours". A group is
-- flagged as needing a sync whenever its membership/base changes; the
-- explicit "Sync All Content" action clears the flag once it actually
-- runs the copy.
ALTER TABLE "CourseContentSyncGroup" ADD COLUMN IF NOT EXISTS "needsSync" BOOLEAN NOT NULL DEFAULT true;
