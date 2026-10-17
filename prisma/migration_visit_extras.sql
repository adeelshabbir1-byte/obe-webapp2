-- Exit surveys (students leaving, faculty and staff), course & teacher evaluations, complaints, lab file, and SAR narrative text. Safe to re-run.
CREATE TABLE IF NOT EXISTS "ExitSurvey" ("id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "kind" TEXT NOT NULL, "subjectId" TEXT NOT NULL, "subjectName" TEXT NOT NULL, "token" TEXT NOT NULL, "answersJson" TEXT, "submittedAt" TIMESTAMP(3), "sentById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX IF NOT EXISTS "ExitSurvey_token_key" ON "ExitSurvey" ("token");
CREATE INDEX IF NOT EXISTS "ExitSurvey_chairmanId_idx" ON "ExitSurvey" ("chairmanId");
CREATE TABLE IF NOT EXISTS "CourseEvaluation" ("id" TEXT PRIMARY KEY, "courseId" TEXT NOT NULL, "studentId" TEXT NOT NULL, "kind" TEXT NOT NULL, "answersJson" TEXT NOT NULL, "comment" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX IF NOT EXISTS "CourseEvaluation_courseId_studentId_kind_key" ON "CourseEvaluation" ("courseId", "studentId", "kind");
CREATE TABLE IF NOT EXISTS "Complaint" ("id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "byStudentId" TEXT, "byUserId" TEXT, "anonymous" BOOLEAN NOT NULL DEFAULT false, "category" TEXT NOT NULL, "subject" TEXT NOT NULL, "details" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'OPEN', "assignedToId" TEXT, "resolution" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "closedAt" TIMESTAMP(3));
CREATE INDEX IF NOT EXISTS "Complaint_chairmanId_idx" ON "Complaint" ("chairmanId");
CREATE TABLE IF NOT EXISTS "LabFileEntry" ("id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "lab" TEXT NOT NULL, "kind" TEXT NOT NULL, "title" TEXT NOT NULL, "courseCode" TEXT, "entryDate" TIMESTAMP(3), "note" TEXT, "fileName" TEXT, "fileUrl" TEXT, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "LabFileEntry_chairmanId_idx" ON "LabFileEntry" ("chairmanId");
CREATE TABLE IF NOT EXISTS "SarNarrative" ("id" TEXT PRIMARY KEY, "cycleId" TEXT NOT NULL, "sectionKey" TEXT NOT NULL, "text" TEXT NOT NULL, "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX IF NOT EXISTS "SarNarrative_cycleId_sectionKey_key" ON "SarNarrative" ("cycleId", "sectionKey");
SELECT 'done' AS result;
