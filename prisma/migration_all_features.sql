-- Evidence files, meeting minutes, change log, outcome figures, surveys, readiness snapshots
CREATE TABLE IF NOT EXISTS "EvidenceFile" ("id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "leadId" TEXT, "criterion" INTEGER, "title" TEXT NOT NULL, "note" TEXT, "fileName" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "size" INTEGER NOT NULL, "data" TEXT NOT NULL, "uploadedById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "EvidenceFile_chairmanId_idx" ON "EvidenceFile"("chairmanId");
CREATE INDEX IF NOT EXISTS "EvidenceFile_leadId_idx" ON "EvidenceFile"("leadId");

CREATE TABLE IF NOT EXISTS "MeetingMinutes" ("id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "leadId" TEXT, "kind" TEXT NOT NULL, "title" TEXT NOT NULL, "meetingDate" TIMESTAMP(3) NOT NULL, "attendees" TEXT, "decisions" TEXT, "fileName" TEXT, "mimeType" TEXT, "data" TEXT, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "MeetingMinutes_chairmanId_kind_idx" ON "MeetingMinutes"("chairmanId","kind");
CREATE INDEX IF NOT EXISTS "MeetingMinutes_createdById_idx" ON "MeetingMinutes"("createdById");

CREATE TABLE IF NOT EXISTS "ChangeLog" ("id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "area" TEXT NOT NULL, "summary" TEXT NOT NULL, "byId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "ChangeLog_chairmanId_area_idx" ON "ChangeLog"("chairmanId","area");

CREATE TABLE IF NOT EXISTS "OutcomeFigure" ("id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "leadId" TEXT NOT NULL, "intakeYear" INTEGER NOT NULL, "admitted" INTEGER NOT NULL DEFAULT 0, "graduated" INTEGER NOT NULL DEFAULT 0, "graduatedOnTime" INTEGER NOT NULL DEFAULT 0, "droppedOut" INTEGER NOT NULL DEFAULT 0, "employedOrStudying" INTEGER, "notes" TEXT, "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX IF NOT EXISTS "OutcomeFigure_leadId_intakeYear_key" ON "OutcomeFigure"("leadId","intakeYear");
CREATE INDEX IF NOT EXISTS "OutcomeFigure_chairmanId_idx" ON "OutcomeFigure"("chairmanId");

CREATE TABLE IF NOT EXISTS "SurveyResult" ("id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "leadId" TEXT NOT NULL, "kind" TEXT NOT NULL, "surveyDate" TIMESTAMP(3) NOT NULL, "respondents" INTEGER NOT NULL DEFAULT 0, "invited" INTEGER, "avgRating" DOUBLE PRECISION, "findings" TEXT, "actionTaken" TEXT, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "SurveyResult_leadId_idx" ON "SurveyResult"("leadId");
CREATE INDEX IF NOT EXISTS "SurveyResult_chairmanId_idx" ON "SurveyResult"("chairmanId");

CREATE TABLE IF NOT EXISTS "ReadinessSnapshot" ("id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "leadId" TEXT NOT NULL, "label" TEXT NOT NULL, "overall" INTEGER, "areas" TEXT NOT NULL, "takenById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "ReadinessSnapshot_leadId_idx" ON "ReadinessSnapshot"("leadId");
CREATE INDEX IF NOT EXISTS "ReadinessSnapshot_chairmanId_idx" ON "ReadinessSnapshot"("chairmanId");
