-- Members listed under a committee position on the organisation chart (OMC members under the OMC Convener, QEC members under the QEC Convener). Safe to rerun.
CREATE TABLE IF NOT EXISTS "OrgMember" (
  "id" TEXT NOT NULL, "positionId" TEXT NOT NULL, "userId" TEXT NOT NULL, "addedById" TEXT,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrgMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrgMember_positionId_userId_key" ON "OrgMember"("positionId", "userId");
CREATE INDEX IF NOT EXISTS "OrgMember_userId_idx" ON "OrgMember"("userId");
