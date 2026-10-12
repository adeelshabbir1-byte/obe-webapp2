-- Faculty annual appraisal (system scorecard + reviewer ratings and remarks + the teacher's reply).
CREATE TABLE IF NOT EXISTS "FacultyAppraisal" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "chairmanId" TEXT NOT NULL,
  "reviewerId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "ratingsJson" TEXT NOT NULL DEFAULT '{}',
  "studentFeedback" DOUBLE PRECISION,
  "overall" TEXT,
  "strengths" TEXT,
  "improve" TEXT,
  "goals" TEXT,
  "metricsJson" TEXT,
  "facultyComment" TEXT,
  "acknowledgedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("userId", "year")
);
CREATE INDEX IF NOT EXISTS "FacultyAppraisal_chairmanId_year_idx" ON "FacultyAppraisal"("chairmanId", "year");
SELECT 'done' AS result;
