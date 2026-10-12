-- Faculty on semester / study leave, or who left: kept on record, not assignable in the terms covered.
CREATE TABLE IF NOT EXISTS "FacultyLeave" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "chairmanId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "fromTerm" INTEGER NOT NULL,
  "toTerm" INTEGER,
  "allowDesign" BOOLEAN NOT NULL DEFAULT false,
  "note" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "FacultyLeave_chairmanId_idx" ON "FacultyLeave"("chairmanId");
CREATE INDEX IF NOT EXISTS "FacultyLeave_userId_idx" ON "FacultyLeave"("userId");
-- Who taught which lectures when a course changes hands mid-semester.
CREATE TABLE IF NOT EXISTS "CourseHandover" (
  "id" TEXT PRIMARY KEY,
  "courseId" TEXT NOT NULL,
  "fromUserId" TEXT NOT NULL,
  "toUserId" TEXT,
  "lecturesDelivered" INTEGER NOT NULL DEFAULT 0,
  "lastLectureNumber" INTEGER,
  "reason" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CourseHandover_courseId_idx" ON "CourseHandover"("courseId");
SELECT 'done' AS result;
