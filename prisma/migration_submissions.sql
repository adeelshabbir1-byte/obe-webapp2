-- Online submission of assignments, projects and lab reports. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "Dropbox" ("id" TEXT PRIMARY KEY, "courseId" TEXT NOT NULL, "instrumentId" TEXT, "title" TEXT NOT NULL, "instructions" TEXT, "dueAt" TIMESTAMP(3) NOT NULL, "allowLate" BOOLEAN NOT NULL DEFAULT true, "status" TEXT NOT NULL DEFAULT 'OPEN', "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "Dropbox_courseId_idx" ON "Dropbox" ("courseId");
CREATE TABLE IF NOT EXISTS "Submission" ("id" TEXT PRIMARY KEY, "dropboxId" TEXT NOT NULL, "studentId" TEXT NOT NULL, "fileName" TEXT NOT NULL, "fileUrl" TEXT NOT NULL, "note" TEXT, "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "late" BOOLEAN NOT NULL DEFAULT false, "score" DOUBLE PRECISION, "feedback" TEXT, "gradedAt" TIMESTAMP(3));
CREATE UNIQUE INDEX IF NOT EXISTS "Submission_dropboxId_studentId_key" ON "Submission" ("dropboxId", "studentId");
SELECT 'done' AS result;
