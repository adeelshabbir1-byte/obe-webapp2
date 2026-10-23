-- Mandatory committees (HEC policies): members and terms, meetings, cases handled (confidential, no names) and the
-- annual report. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "Committee" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "kind" TEXT NOT NULL, "name" TEXT NOT NULL, "policyRef" TEXT,
  "termStart" TIMESTAMP(3), "termEnd" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Committee_chairmanId_idx" ON "Committee" ("chairmanId");
CREATE TABLE IF NOT EXISTS "CommitteeMember" (
  "id" TEXT PRIMARY KEY, "committeeId" TEXT NOT NULL, "userId" TEXT, "name" TEXT NOT NULL, "role" TEXT NOT NULL DEFAULT 'MEMBER',
  "gender" TEXT, "organisation" TEXT, "fromDate" TIMESTAMP(3), "toDate" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "CommitteeMember_committeeId_idx" ON "CommitteeMember" ("committeeId");
CREATE TABLE IF NOT EXISTS "CommitteeMeeting" (
  "id" TEXT PRIMARY KEY, "committeeId" TEXT NOT NULL, "date" TIMESTAMP(3) NOT NULL, "agenda" TEXT, "decisions" TEXT, "attendees" INTEGER, "createdById" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "CommitteeMeeting_committeeId_idx" ON "CommitteeMeeting" ("committeeId");
CREATE TABLE IF NOT EXISTS "CommitteeCase" (
  "id" TEXT PRIMARY KEY, "committeeId" TEXT NOT NULL, "caseNo" TEXT NOT NULL, "receivedAt" TIMESTAMP(3) NOT NULL, "category" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED', "outcome" TEXT, "notes" TEXT, "closedAt" TIMESTAMP(3), "createdById" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CommitteeCase_committeeId_idx" ON "CommitteeCase" ("committeeId");
SELECT 'done' AS result;
