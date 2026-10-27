-- Topic Workspace planning: side tables only (nothing is added to Course or CurriculumType). Importance and other
-- per-topic facts keyed to the lecture row; each person's open courses and draft; multi-item plan proposals (with linked
-- moves between courses); topic-link proposals with their approvals; plan versions (undo, compare); topic comments and
-- teaching notes; topic performance per offering; students' "hardest topics" votes; ready help for hard topics;
-- remembered suggestion decisions; an AI cache; who is editing now; and the workspace settings. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "TopicMeta" (
  "lectureRowId" TEXT PRIMARY KEY, "courseId" TEXT NOT NULL,
  "importance" TEXT, "importanceConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "industry" TEXT, "reading" TEXT, "needsClo" BOOLEAN NOT NULL DEFAULT false, "movedFrom" TEXT,
  "notTaught" BOOLEAN NOT NULL DEFAULT false, "notTaughtNote" TEXT,
  "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "TopicMeta_courseId_idx" ON "TopicMeta"("courseId");

CREATE TABLE IF NOT EXISTS "WorkspaceState" (
  "userId" TEXT PRIMARY KEY, "openJson" TEXT NOT NULL DEFAULT '[]', "draftJson" TEXT, "draftAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "PlanProposal" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "courseId" TEXT NOT NULL, "source" TEXT NOT NULL DEFAULT 'SE',
  "kind" TEXT NOT NULL DEFAULT 'EDIT', "fromUserId" TEXT NOT NULL, "toUserId" TEXT, "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "reason" TEXT, "beforeJson" TEXT NOT NULL DEFAULT '[]', "afterJson" TEXT NOT NULL DEFAULT '[]',
  "templateRequestId" TEXT, "respondedById" TEXT, "respondedAt" TIMESTAMP(3),
  "remindedAt" TIMESTAMP(3), "escalatedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PlanProposal_courseId_idx" ON "PlanProposal"("courseId", "status");
CREATE INDEX IF NOT EXISTS "PlanProposal_toUserId_idx" ON "PlanProposal"("toUserId", "status");
CREATE INDEX IF NOT EXISTS "PlanProposal_fromUserId_idx" ON "PlanProposal"("fromUserId");

CREATE TABLE IF NOT EXISTS "PlanProposalItem" (
  "id" TEXT PRIMARY KEY, "proposalId" TEXT NOT NULL, "kind" TEXT NOT NULL, "lectureRowId" TEXT,
  "topic" TEXT NOT NULL DEFAULT '', "subtopic" TEXT, "detailJson" TEXT NOT NULL DEFAULT '{}', "position" INTEGER NOT NULL DEFAULT 0,
  "linkKey" TEXT, "status" TEXT NOT NULL DEFAULT 'PENDING', "reason" TEXT, "decidedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "PlanProposalItem_proposalId_idx" ON "PlanProposalItem"("proposalId");
CREATE INDEX IF NOT EXISTS "PlanProposalItem_linkKey_idx" ON "PlanProposalItem"("linkKey");

CREATE TABLE IF NOT EXISTS "TopicLinkProposal" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "coordinatorId" TEXT NOT NULL, "kind" TEXT NOT NULL,
  "level" TEXT NOT NULL, "action" TEXT NOT NULL DEFAULT 'ADD',
  "fromCourseId" TEXT NOT NULL, "fromCode" TEXT NOT NULL, "fromTopic" TEXT NOT NULL,
  "toCourseId" TEXT NOT NULL, "toCode" TEXT NOT NULL, "toTopic" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "seFromAt" TIMESTAMP(3), "seFromById" TEXT, "seToAt" TIMESTAMP(3), "seToById" TEXT,
  "plAt" TIMESTAMP(3), "plById" TEXT, "reason" TEXT, "note" TEXT, "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "decidedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "TopicLinkProposal_status_idx" ON "TopicLinkProposal"("chairmanId", "status");

CREATE TABLE IF NOT EXISTS "TopicPlanVersion" (
  "id" TEXT PRIMARY KEY, "courseId" TEXT NOT NULL, "source" TEXT NOT NULL, "sessionId" TEXT, "byUserId" TEXT NOT NULL,
  "label" TEXT, "rowsJson" TEXT NOT NULL, "afterJson" TEXT, "undone" BOOLEAN NOT NULL DEFAULT false,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "TopicPlanVersion_courseId_idx" ON "TopicPlanVersion"("courseId", "source", "at");
CREATE INDEX IF NOT EXISTS "TopicPlanVersion_sessionId_idx" ON "TopicPlanVersion"("byUserId", "sessionId");

CREATE TABLE IF NOT EXISTS "TopicComment" (
  "id" TEXT PRIMARY KEY, "courseId" TEXT NOT NULL, "lectureRowId" TEXT, "topicKey" TEXT NOT NULL,
  "userId" TEXT NOT NULL, "body" TEXT NOT NULL, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "TopicComment_courseId_idx" ON "TopicComment"("courseId", "topicKey");

CREATE TABLE IF NOT EXISTS "TopicNote" (
  "id" TEXT PRIMARY KEY, "coordinatorId" TEXT NOT NULL, "courseCode" TEXT NOT NULL, "topicKey" TEXT NOT NULL, "topic" TEXT NOT NULL,
  "courseId" TEXT NOT NULL, "termLabel" TEXT, "note" TEXT NOT NULL, "byUserId" TEXT NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "TopicNote_code_idx" ON "TopicNote"("coordinatorId", "courseCode", "topicKey");

CREATE TABLE IF NOT EXISTS "TopicPerformance" (
  "id" TEXT PRIMARY KEY, "courseId" TEXT NOT NULL, "coordinatorId" TEXT NOT NULL, "courseCode" TEXT NOT NULL,
  "lectureRowId" TEXT, "topicKey" TEXT NOT NULL, "topic" TEXT NOT NULL, "termLabel" TEXT, "batchLabel" TEXT,
  "offeredAt" TIMESTAMP(3), "students" INTEGER NOT NULL DEFAULT 0, "avgPct" DOUBLE PRECISION, "belowPct" DOUBLE PRECISION,
  "questions" INTEGER NOT NULL DEFAULT 0, "assessments" INTEGER NOT NULL DEFAULT 0, "lectures" INTEGER NOT NULL DEFAULT 0,
  "sections" INTEGER NOT NULL DEFAULT 1, "sourceKind" TEXT NOT NULL DEFAULT 'APPROVAL',
  "storedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "TopicPerformance_courseId_topicKey_key" ON "TopicPerformance"("courseId", "topicKey");
CREATE INDEX IF NOT EXISTS "TopicPerformance_code_idx" ON "TopicPerformance"("coordinatorId", "courseCode");
CREATE INDEX IF NOT EXISTS "TopicPerformance_row_idx" ON "TopicPerformance"("lectureRowId");

CREATE TABLE IF NOT EXISTS "TopicDifficultyVote" (
  "courseId" TEXT NOT NULL, "studentId" TEXT NOT NULL, "topicKey" TEXT NOT NULL, "topic" TEXT NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY ("courseId", "studentId", "topicKey")
);

CREATE TABLE IF NOT EXISTS "TopicHelp" (
  "id" TEXT PRIMARY KEY, "coordinatorId" TEXT NOT NULL, "courseCode" TEXT NOT NULL, "topicKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'MATERIAL', "title" TEXT NOT NULL, "url" TEXT, "byUserId" TEXT NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "TopicHelp_code_idx" ON "TopicHelp"("coordinatorId", "courseCode", "topicKey");
CREATE TABLE IF NOT EXISTS "TopicHelpSent" (
  "courseId" TEXT NOT NULL, "topicKey" TEXT NOT NULL, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("courseId", "topicKey")
);

CREATE TABLE IF NOT EXISTS "SuggestionDecision" (
  "chairmanId" TEXT NOT NULL, "kind" TEXT NOT NULL, "key" TEXT NOT NULL, "textHash" TEXT NOT NULL,
  "decision" TEXT NOT NULL, "reason" TEXT, "byUserId" TEXT NOT NULL, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("chairmanId", "kind", "key")
);

CREATE TABLE IF NOT EXISTS "AiTopicCache" (
  "key" TEXT PRIMARY KEY, "resultJson" TEXT NOT NULL, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "WorkspacePresence" (
  "userId" TEXT NOT NULL, "courseId" TEXT NOT NULL, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("userId", "courseId")
);
CREATE INDEX IF NOT EXISTS "WorkspacePresence_courseId_idx" ON "WorkspacePresence"("courseId", "at");

CREATE TABLE IF NOT EXISTS "TopicPlanSetting" (
  "chairmanId" TEXT PRIMARY KEY, "remindDays" INTEGER NOT NULL DEFAULT 3, "escalateDays" INTEGER NOT NULL DEFAULT 7,
  "minBankQuestions" INTEGER NOT NULL DEFAULT 5, "minStudents" INTEGER NOT NULL DEFAULT 30, "minSection" INTEGER NOT NULL DEFAULT 15,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
