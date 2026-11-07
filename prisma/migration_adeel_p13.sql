-- Queue items 16-22 (7 Nov 2026): personal working days, degree audit snapshots, exam set-up / seating / duties,
-- run-time paper generation, workflow gaps, monitoring and reports. Only new tables. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "DeadlineFixed" ("deadlineId" TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS "ExamSessionExtra" ("sessionId" TEXT PRIMARY KEY, "json" TEXT NOT NULL DEFAULT '{}', "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS "ExamDutyOpt" ("sessionId" TEXT NOT NULL, "userId" TEXT NOT NULL, "json" TEXT NOT NULL DEFAULT '{}', PRIMARY KEY ("sessionId", "userId"));
CREATE TABLE IF NOT EXISTS "ExamRoomLog" ("id" TEXT PRIMARY KEY, "sessionId" TEXT NOT NULL, "slotKey" TEXT NOT NULL, "roomId" TEXT NOT NULL, "kind" TEXT NOT NULL, "userId" TEXT NOT NULL, "dataJson" TEXT NOT NULL DEFAULT '{}', "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "ExamRoomLog_session_idx" ON "ExamRoomLog"("sessionId");
CREATE TABLE IF NOT EXISTS "DegreeAuditSnapshot" ("id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "studentId" TEXT NOT NULL, "issueId" TEXT, "auditJson" TEXT NOT NULL, "hash" TEXT NOT NULL, "signedById" TEXT NOT NULL, "signedByName" TEXT NOT NULL, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "DegreeAuditSnapshot_student_idx" ON "DegreeAuditSnapshot"("studentId");
CREATE TABLE IF NOT EXISTS "PaperGenSetting" ("id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "courseCode" TEXT NOT NULL, "examType" TEXT NOT NULL, "specJson" TEXT NOT NULL DEFAULT '{}', "status" TEXT NOT NULL DEFAULT 'DRAFT', "proposedById" TEXT, "plById" TEXT, "plAt" TIMESTAMP(3), "omcById" TEXT, "omcAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX IF NOT EXISTS "PaperGenSetting_key" ON "PaperGenSetting"("chairmanId", "courseCode", "examType");
CREATE TABLE IF NOT EXISTS "GeneratedPaper" ("id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "settingId" TEXT NOT NULL, "courseCode" TEXT NOT NULL, "examType" TEXT NOT NULL, "version" INTEGER NOT NULL, "itemIdsJson" TEXT NOT NULL, "checkCode" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'GENERATED', "reviewById" TEXT, "reviewAt" TIMESTAMP(3), "swapsJson" TEXT NOT NULL DEFAULT '[]', "errorNote" TEXT, "generatedById" TEXT NOT NULL, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX IF NOT EXISTS "GeneratedPaper_code" ON "GeneratedPaper"("checkCode");
CREATE TABLE IF NOT EXISTS "CourseNote" ("id" TEXT PRIMARY KEY, "courseId" TEXT NOT NULL, "lectureNumber" INTEGER, "kind" TEXT NOT NULL, "userId" TEXT NOT NULL, "toUserId" TEXT, "cqiId" TEXT, "text" TEXT NOT NULL, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "CourseNote_course_idx" ON "CourseNote"("courseId");
CREATE TABLE IF NOT EXISTS "NationalReview" ("id" TEXT PRIMARY KEY, "refKind" TEXT NOT NULL, "refId" TEXT NOT NULL, "title" TEXT NOT NULL, "adoptions" INTEGER NOT NULL DEFAULT 0, "status" TEXT NOT NULL DEFAULT 'OPEN', "decision" TEXT, "decidedById" TEXT, "decidedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX IF NOT EXISTS "NationalReview_ref" ON "NationalReview"("refKind", "refId");
CREATE TABLE IF NOT EXISTS "LabBroadcast" ("id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "courseCode" TEXT NOT NULL, "week" INTEGER NOT NULL, "instructions" TEXT NOT NULL, "rubric" TEXT, "sentById" TEXT NOT NULL, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS "LabBroadcastAck" ("broadcastId" TEXT NOT NULL, "userId" TEXT NOT NULL, "courseId" TEXT NOT NULL, "note" TEXT, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY ("broadcastId", "userId"));
CREATE TABLE IF NOT EXISTS "AdviserNote" ("id" TEXT PRIMARY KEY, "studentId" TEXT NOT NULL, "adviserId" TEXT NOT NULL, "text" TEXT NOT NULL, "planTerm" TEXT, "planApproved" BOOLEAN NOT NULL DEFAULT false, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "AdviserNote_student_idx" ON "AdviserNote"("studentId");
CREATE TABLE IF NOT EXISTS "LabCourseNeed" ("id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "courseId" TEXT NOT NULL, "category" TEXT NOT NULL, "perStudents" INTEGER NOT NULL DEFAULT 1, "labId" TEXT, "note" TEXT);
CREATE INDEX IF NOT EXISTS "LabCourseNeed_chairman_idx" ON "LabCourseNeed"("chairmanId");
CREATE TABLE IF NOT EXISTS "ComplianceItem" ("id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "body" TEXT NOT NULL, "code" TEXT NOT NULL, "title" TEXT NOT NULL, "ownerId" TEXT, "dueDate" TIMESTAMP(3), "status" TEXT NOT NULL DEFAULT 'OPEN', "evidenceUrl" TEXT, "improvement" TEXT, "checkedAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX IF NOT EXISTS "ComplianceItem_key" ON "ComplianceItem"("chairmanId", "body", "code");
CREATE TABLE IF NOT EXISTS "ReportVersion" ("id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "kind" TEXT NOT NULL, "title" TEXT NOT NULL, "byId" TEXT, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "ReportVersion_chairman_idx" ON "ReportVersion"("chairmanId");
