-- FYP: per-presentation evaluator mode and panels, remark replies, supervisor meetings, open house, student CVs. Safe to run more than once.
ALTER TABLE "FypMilestone" ADD COLUMN IF NOT EXISTS "evaluatorMode" TEXT NOT NULL DEFAULT 'PANEL';
ALTER TABLE "FypGroup" ADD COLUMN IF NOT EXISTS "stall" TEXT;
CREATE TABLE IF NOT EXISTS "FypMilestonePanel" ("id" TEXT PRIMARY KEY, "milestoneId" TEXT NOT NULL, "groupId" TEXT NOT NULL, "panelId" TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS "FypMilestonePanel_milestoneId_groupId_key" ON "FypMilestonePanel" ("milestoneId", "groupId");
CREATE TABLE IF NOT EXISTS "FypRemarkReply" ("id" TEXT PRIMARY KEY, "evaluationId" TEXT NOT NULL, "studentId" TEXT NOT NULL, "text" TEXT NOT NULL, "addressed" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "FypRemarkReply_evaluationId_idx" ON "FypRemarkReply" ("evaluationId");
CREATE TABLE IF NOT EXISTS "FypMeeting" ("id" TEXT PRIMARY KEY, "groupId" TEXT NOT NULL, "heldAt" TIMESTAMP(3) NOT NULL, "nextAt" TIMESTAMP(3), "feedback" TEXT, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "FypMeeting_groupId_idx" ON "FypMeeting" ("groupId");
CREATE TABLE IF NOT EXISTS "FypMeetingAttendance" ("id" TEXT PRIMARY KEY, "meetingId" TEXT NOT NULL, "studentId" TEXT NOT NULL, "present" BOOLEAN NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS "FypMeetingAttendance_meetingId_studentId_key" ON "FypMeetingAttendance" ("meetingId", "studentId");
CREATE TABLE IF NOT EXISTS "FypMeetingTask" ("id" TEXT PRIMARY KEY, "meetingId" TEXT NOT NULL, "groupId" TEXT NOT NULL, "studentId" TEXT, "text" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'OPEN', "reviewedAt" TIMESTAMP(3));
CREATE INDEX IF NOT EXISTS "FypMeetingTask_groupId_idx" ON "FypMeetingTask" ("groupId");
CREATE TABLE IF NOT EXISTS "FypShowcasePick" ("id" TEXT PRIMARY KEY, "externalId" TEXT NOT NULL, "groupId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX IF NOT EXISTS "FypShowcasePick_externalId_groupId_key" ON "FypShowcasePick" ("externalId", "groupId");
CREATE TABLE IF NOT EXISTS "StudentCv" ("studentId" TEXT PRIMARY KEY, "dataJson" TEXT NOT NULL, "showCgpa" BOOLEAN NOT NULL DEFAULT false, "published" BOOLEAN NOT NULL DEFAULT false, "status" TEXT NOT NULL DEFAULT 'DRAFT', "reviewerNote" TEXT, "reviewedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
SELECT 'done' AS result;
