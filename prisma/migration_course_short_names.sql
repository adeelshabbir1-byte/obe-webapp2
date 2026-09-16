-- Run in Supabase SQL Editor. Adds CourseShortName — a chairman-scoped,
-- purely cosmetic short display name per course code, used only in the
-- Section Assignment Matrix instead of the automatic first-3-letters
-- abbreviation.

CREATE TABLE IF NOT EXISTS "CourseShortName" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "chairmanId" TEXT NOT NULL REFERENCES "User"("id"),
  "courseCode" TEXT NOT NULL,
  "shortName" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CourseShortName_chairmanId_courseCode_key" ON "CourseShortName"("chairmanId", "courseCode");
