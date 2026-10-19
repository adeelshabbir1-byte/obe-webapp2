-- FYP: co-supervisors, the FYP head's extra settings (co-supervisor share, evaluator scaling, evaluators needed,
-- meetings expected). Society elections: elections, candidates, secret ballots, office holders' plans and event reports.
-- Safe to run more than once.
CREATE TABLE IF NOT EXISTS "FypCycleExtra" (
  "id" TEXT NOT NULL, "cycleId" TEXT NOT NULL, "coSupervisorPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "scaling" TEXT NOT NULL DEFAULT 'NONE', "minEvaluators" INTEGER NOT NULL DEFAULT 1, "minMeetings" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FypCycleExtra_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FypCycleExtra_cycleId_key" ON "FypCycleExtra"("cycleId");
CREATE TABLE IF NOT EXISTS "FypCoSupervisor" (
  "id" TEXT NOT NULL, "groupId" TEXT NOT NULL, "userId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FypCoSupervisor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FypCoSupervisor_groupId_key" ON "FypCoSupervisor"("groupId");
CREATE INDEX IF NOT EXISTS "FypCoSupervisor_userId_idx" ON "FypCoSupervisor"("userId");

CREATE TABLE IF NOT EXISTS "SocietyElection" (
  "id" TEXT NOT NULL, "chairmanId" TEXT NOT NULL, "societyId" TEXT NOT NULL, "title" TEXT NOT NULL,
  "positionsJson" TEXT NOT NULL DEFAULT '[]', "voterScope" TEXT NOT NULL DEFAULT 'SOCIETY', "term" TEXT NOT NULL,
  "applyFrom" TIMESTAMP(3) NOT NULL, "applyTo" TIMESTAMP(3) NOT NULL, "voteFrom" TIMESTAMP(3) NOT NULL, "voteTo" TIMESTAMP(3) NOT NULL,
  "minCgpa" DOUBLE PRECISION, "minSemester" INTEGER, "published" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocietyElection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SocietyElection_chairmanId_idx" ON "SocietyElection"("chairmanId");
CREATE TABLE IF NOT EXISTS "ElectionCandidate" (
  "id" TEXT NOT NULL, "electionId" TEXT NOT NULL, "studentId" TEXT NOT NULL, "position" TEXT NOT NULL,
  "manifesto" TEXT NOT NULL, "plan" TEXT NOT NULL, "videoUrl" TEXT,
  "advisorStatus" TEXT NOT NULL DEFAULT 'PENDING', "headStatus" TEXT NOT NULL DEFAULT 'PENDING', "note" TEXT,
  "votes" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ElectionCandidate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ElectionCandidate_electionId_idx" ON "ElectionCandidate"("electionId");
CREATE TABLE IF NOT EXISTS "ElectionBallot" (
  "id" TEXT NOT NULL, "electionId" TEXT NOT NULL, "position" TEXT NOT NULL, "studentId" TEXT NOT NULL,
  "castAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ElectionBallot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ElectionBallot_electionId_position_studentId_key" ON "ElectionBallot"("electionId", "position", "studentId");
CREATE TABLE IF NOT EXISTS "SocietyPlan" (
  "id" TEXT NOT NULL, "societyId" TEXT NOT NULL, "studentId" TEXT NOT NULL, "term" TEXT NOT NULL, "kind" TEXT NOT NULL,
  "eventId" TEXT, "text" TEXT NOT NULL, "participants" INTEGER, "status" TEXT NOT NULL DEFAULT 'PENDING', "note" TEXT,
  "decidedById" TEXT, "decidedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocietyPlan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SocietyPlan_societyId_idx" ON "SocietyPlan"("societyId");
