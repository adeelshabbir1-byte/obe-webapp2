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
  "courseId" TEXT NOT NULL UNIQUE REFERENCES "Course"("id")
);
CREATE INDEX IF NOT EXISTS "CourseContentSyncMember_groupId_idx" ON "CourseContentSyncMember"("groupId");
