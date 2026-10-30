-- One committee engine for the OMC, the Board of Studies and later the Faculty Board and the Academic Council:
-- committees (scope, mode, quorum, majority, Convener), members (internal, or external with a guest link limited to the
-- committee's items), meetings with attendance and signed minutes, items (a linked draft) with votes, the Convener's
-- decision and the optional Academic Council step. Side tables only; safe to run more than once.
CREATE TABLE IF NOT EXISTS "CmtCommittee" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "type" TEXT NOT NULL, "scope" TEXT NOT NULL DEFAULT 'INSTITUTE', "scopeId" TEXT,
  "name" TEXT NOT NULL, "mode" TEXT NOT NULL DEFAULT 'FULL', "quorumPct" DOUBLE PRECISION NOT NULL DEFAULT 50, "majorityPct" DOUBLE PRECISION NOT NULL DEFAULT 50,
  "convenerId" TEXT, "councilStep" BOOLEAN NOT NULL DEFAULT false, "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CmtCommittee_chairman_idx" ON "CmtCommittee"("chairmanId", "type");

CREATE TABLE IF NOT EXISTS "CmtMember" (
  "id" TEXT PRIMARY KEY, "committeeId" TEXT NOT NULL, "userId" TEXT, "name" TEXT NOT NULL, "email" TEXT, "organisation" TEXT,
  "external" BOOLEAN NOT NULL DEFAULT false, "tokenHash" TEXT, "tokenSetAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CmtMember_committee_idx" ON "CmtMember"("committeeId");
CREATE UNIQUE INDEX IF NOT EXISTS "CmtMember_token_key" ON "CmtMember"("tokenHash");

CREATE TABLE IF NOT EXISTS "CmtMeeting" (
  "id" TEXT PRIMARY KEY, "committeeId" TEXT NOT NULL, "date" TIMESTAMP(3) NOT NULL, "venue" TEXT, "attendanceJson" TEXT NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'PLANNED', "minutesRef" TEXT, "minutesName" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CmtMeeting_committee_idx" ON "CmtMeeting"("committeeId", "date");

CREATE TABLE IF NOT EXISTS "CmtItem" (
  "id" TEXT PRIMARY KEY, "committeeId" TEXT NOT NULL, "meetingId" TEXT, "kind" TEXT NOT NULL DEFAULT 'GENERIC', "refId" TEXT,
  "title" TEXT NOT NULL, "summary" TEXT, "href" TEXT, "status" TEXT NOT NULL DEFAULT 'OPEN', "outcome" TEXT, "decisionNote" TEXT,
  "decidedById" TEXT, "decidedAt" TIMESTAMP(3), "meetingDate" TIMESTAMP(3), "signedRef" TEXT, "signedName" TEXT,
  "councilStatus" TEXT, "councilDate" TIMESTAMP(3), "councilRef" TEXT, "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CmtItem_committee_idx" ON "CmtItem"("committeeId", "status");
CREATE INDEX IF NOT EXISTS "CmtItem_ref_idx" ON "CmtItem"("kind", "refId");

CREATE TABLE IF NOT EXISTS "CmtVote" (
  "itemId" TEXT NOT NULL, "memberId" TEXT NOT NULL, "vote" TEXT NOT NULL, "comment" TEXT, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("itemId", "memberId")
);
