-- Platform team: national curriculum teams (Convener + National Subject Experts) per discipline area, and the other
-- platform roles that each open only their own admin pages.
CREATE TABLE IF NOT EXISTS "PlatformTeam" (
  "id"           TEXT PRIMARY KEY,
  "name"         TEXT NOT NULL,
  "councilsJson" TEXT NOT NULL DEFAULT '[]',
  "programsJson" TEXT NOT NULL DEFAULT '[]',
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "PlatformTeamMember" (
  "teamId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role"   TEXT NOT NULL DEFAULT 'MEMBER',
  PRIMARY KEY ("teamId", "userId")
);
CREATE INDEX IF NOT EXISTS "PlatformTeamMember_userId_idx" ON "PlatformTeamMember"("userId");
CREATE TABLE IF NOT EXISTS "PlatformRole" (
  "userId"      TEXT NOT NULL,
  "role"        TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("userId", "role")
);
