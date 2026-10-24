-- Affiliated colleges follow their university: the course design a college course took from the university's
-- Subject Expert, and the university's marks distribution (each head's share and who enters it).
CREATE TABLE IF NOT EXISTS "AffiliateCourseSync" (
  "courseId"     TEXT PRIMARY KEY,
  "fromCourseId" TEXT NOT NULL,
  "fingerprint"  TEXT NOT NULL,
  "syncedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "AffiliateMarksPolicy" (
  "id"           TEXT PRIMARY KEY,
  "universityId" TEXT NOT NULL,
  "collegeId"    TEXT,
  "courseKey"    TEXT,
  "headsJson"    TEXT NOT NULL DEFAULT '[]',
  "updatedById"  TEXT,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AffiliateMarksPolicy_universityId_idx" ON "AffiliateMarksPolicy"("universityId");
CREATE UNIQUE INDEX IF NOT EXISTS "AffiliateMarksPolicy_scope_key" ON "AffiliateMarksPolicy"("universityId", COALESCE("collegeId", ''), COALESCE("courseKey", ''));
