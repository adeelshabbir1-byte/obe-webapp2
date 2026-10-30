-- CLO attainment methods chosen by the OMC, item mapping (splits, Not for CLO, excluded, faulty, method-3 weights),
-- lab / theory parts, the per-term lock, assessment types, early warning and the marks deadline. Side tables only;
-- safe to run more than once.
CREATE TABLE IF NOT EXISTS "CloMethodSetting" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "program" TEXT NOT NULL DEFAULT '',
  "method" TEXT NOT NULL DEFAULT 'GRADE', "passPct" DOUBLE PRECISION NOT NULL DEFAULT 50, "itemsPct" DOUBLE PRECISION NOT NULL DEFAULT 50,
  "targetPct" DOUBLE PRECISION NOT NULL DEFAULT 60, "levelsJson" TEXT NOT NULL DEFAULT '{"excellent":80,"good":60,"satisfactory":50}',
  "faultyAvgPct" DOUBLE PRECISION NOT NULL DEFAULT 40, "labSharePct" DOUBLE PRECISION NOT NULL DEFAULT 20,
  "labPassOn" BOOLEAN NOT NULL DEFAULT false, "labPassPct" DOUBLE PRECISION NOT NULL DEFAULT 50,
  "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CloMethodSetting_scope_key" ON "CloMethodSetting"("chairmanId", "program");

CREATE TABLE IF NOT EXISTS "CourseCloRequest" (
  "id" TEXT PRIMARY KEY, "courseId" TEXT NOT NULL, "kind" TEXT NOT NULL, "valueJson" TEXT NOT NULL, "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "requestedById" TEXT NOT NULL, "votesJson" TEXT NOT NULL DEFAULT '[]',
  "decidedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CourseCloRequest_course_idx" ON "CourseCloRequest"("courseId", "kind");

CREATE TABLE IF NOT EXISTS "CloItemMap" (
  "instrumentId" TEXT PRIMARY KEY, "courseId" TEXT NOT NULL, "source" TEXT NOT NULL,
  "splitsJson" TEXT, "weightsJson" TEXT, "typeKey" TEXT, "part" TEXT,
  "notForClo" BOOLEAN NOT NULL DEFAULT false, "notForCloReason" TEXT,
  "excluded" BOOLEAN NOT NULL DEFAULT false, "excludedReason" TEXT,
  "faulty" BOOLEAN NOT NULL DEFAULT false, "faultyReason" TEXT, "faultyNoGrade" BOOLEAN NOT NULL DEFAULT false, "faultyById" TEXT, "faultyAt" TIMESTAMP(3),
  "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CloItemMap_course_idx" ON "CloItemMap"("courseId", "source");

CREATE TABLE IF NOT EXISTS "CloPart" ("cloId" TEXT PRIMARY KEY, "courseId" TEXT NOT NULL, "part" TEXT NOT NULL DEFAULT 'THEORY');
CREATE INDEX IF NOT EXISTS "CloPart_course_idx" ON "CloPart"("courseId");

CREATE TABLE IF NOT EXISTS "CloTermLock" (
  "id" TEXT PRIMARY KEY, "courseId" TEXT NOT NULL, "termName" TEXT NOT NULL, "termYear" INTEGER NOT NULL,
  "settingsJson" TEXT NOT NULL, "resultJson" TEXT NOT NULL, "recalcSettingsJson" TEXT, "recalcResultJson" TEXT,
  "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "recalculatedAt" TIMESTAMP(3), "recalculatedById" TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS "CloTermLock_term_key" ON "CloTermLock"("courseId", "termName", "termYear");

CREATE TABLE IF NOT EXISTS "AssessmentTypeDef" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "key" TEXT NOT NULL, "name" TEXT NOT NULL, "family" TEXT NOT NULL,
  "part" TEXT NOT NULL DEFAULT 'BOTH', "marking" TEXT NOT NULL DEFAULT 'MARKS', "groupWork" BOOLEAN NOT NULL DEFAULT false,
  "defaultNotForClo" BOOLEAN NOT NULL DEFAULT false, "evidence" TEXT NOT NULL DEFAULT 'paper', "graded" BOOLEAN NOT NULL DEFAULT true,
  "ccp" BOOLEAN NOT NULL DEFAULT false, "retired" BOOLEAN NOT NULL DEFAULT false, "sort" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS "AssessmentTypeDef_key" ON "AssessmentTypeDef"("chairmanId", "key");

CREATE TABLE IF NOT EXISTS "WarnSetting" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "scope" TEXT NOT NULL, "valuesJson" TEXT NOT NULL DEFAULT '{}',
  "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "WarnSetting_scope_key" ON "WarnSetting"("chairmanId", "scope");

CREATE TABLE IF NOT EXISTS "SettingChange" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "area" TEXT NOT NULL, "scope" TEXT NOT NULL, "field" TEXT NOT NULL,
  "oldValue" TEXT, "newValue" TEXT, "byUserId" TEXT NOT NULL, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SettingChange_idx" ON "SettingChange"("chairmanId", "area", "at");

CREATE TABLE IF NOT EXISTS "ItemWarning" (
  "id" TEXT PRIMARY KEY, "courseId" TEXT NOT NULL, "instrumentId" TEXT NOT NULL, "level" TEXT NOT NULL, "belowPct" DOUBLE PRECISION NOT NULL,
  "sat" INTEGER NOT NULL, "below" INTEGER NOT NULL, "topic" TEXT, "diagnosis" TEXT, "toJson" TEXT NOT NULL DEFAULT '[]', "ccJson" TEXT NOT NULL DEFAULT '[]',
  "stage" TEXT NOT NULL DEFAULT 'TEACHER', "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "respondedAt" TIMESTAMP(3), "respondedById" TEXT,
  "actionsJson" TEXT NOT NULL DEFAULT '[]', "note" TEXT, "cqiRecordId" TEXT, "effectJson" TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS "ItemWarning_item_key" ON "ItemWarning"("instrumentId");
CREATE INDEX IF NOT EXISTS "ItemWarning_course_idx" ON "ItemWarning"("courseId");

CREATE TABLE IF NOT EXISTS "MarksDeadline" (
  "instrumentId" TEXT PRIMARY KEY, "courseId" TEXT NOT NULL, "heldOn" TIMESTAMP(3) NOT NULL, "dueOn" TIMESTAMP(3) NOT NULL,
  "enteredAt" TIMESTAMP(3), "late" BOOLEAN NOT NULL DEFAULT false, "remindedJson" TEXT NOT NULL DEFAULT '[]', "escalatedAt" TIMESTAMP(3),
  "unlockedById" TEXT, "unlockReason" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "MarksDeadline_course_idx" ON "MarksDeadline"("courseId");

CREATE TABLE IF NOT EXISTS "LabRowMeta" (
  "labCourseId" TEXT NOT NULL, "labNumber" INTEGER NOT NULL, "hours" DOUBLE PRECISION NOT NULL DEFAULT 3, "cloId" TEXT, "tools" TEXT, "deliverable" TEXT,
  "labOnly" BOOLEAN NOT NULL DEFAULT false, "kind" TEXT NOT NULL DEFAULT 'TASK', "aheadReason" TEXT, "bestOf" TEXT,
  PRIMARY KEY ("labCourseId", "labNumber")
);

CREATE TABLE IF NOT EXISTS "TopicPractice" ("lectureRowId" TEXT PRIMARY KEY, "courseId" TEXT NOT NULL, "needsPractice" BOOLEAN NOT NULL DEFAULT true);
