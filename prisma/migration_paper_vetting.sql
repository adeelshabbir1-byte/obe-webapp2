-- Exam paper vetting: the teacher's question text, the system's and the AI's checks, and the Program Lead's decision. Safe to re-run.
CREATE TABLE IF NOT EXISTS "PaperVetting" ("id" TEXT PRIMARY KEY, "courseId" TEXT NOT NULL, "examType" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'DRAFT', "questionsJson" TEXT NOT NULL DEFAULT '{}', "systemJson" TEXT, "aiJson" TEXT, "teacherNote" TEXT, "submittedAt" TIMESTAMP(3), "reviewerId" TEXT, "reviewNote" TEXT, "decidedAt" TIMESTAMP(3), "round" INTEGER NOT NULL DEFAULT 1, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX IF NOT EXISTS "PaperVetting_courseId_examType_key" ON "PaperVetting" ("courseId", "examType");
SELECT 'done' AS result;
