-- The OMC's minimum number of questions in the Midterm and Final papers, per course type. New table only.
CREATE TABLE IF NOT EXISTS "ExamQuestionPolicy" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "courseType" TEXT NOT NULL,
  "midtermMinQuestions" INTEGER NOT NULL DEFAULT 0,
  "finalMinQuestions" INTEGER NOT NULL DEFAULT 0,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ExamQuestionPolicy_chairmanId_courseType_key" ON "ExamQuestionPolicy"("chairmanId", "courseType");
SELECT 'done' AS result;
