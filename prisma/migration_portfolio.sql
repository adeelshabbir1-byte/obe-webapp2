-- Work samples (high / medium / low scripts per assessment) and student e-portfolios. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "StudentWorkSample" ("id" TEXT PRIMARY KEY, "courseId" TEXT NOT NULL, "instrumentId" TEXT NOT NULL, "studentId" TEXT NOT NULL, "level" TEXT NOT NULL, "score" DOUBLE PRECISION, "fileName" TEXT NOT NULL, "fileUrl" TEXT NOT NULL, "uploadedById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "StudentWorkSample_courseId_idx" ON "StudentWorkSample" ("courseId");
CREATE INDEX IF NOT EXISTS "StudentWorkSample_studentId_idx" ON "StudentWorkSample" ("studentId");
CREATE TABLE IF NOT EXISTS "StudentPortfolioItem" ("id" TEXT PRIMARY KEY, "studentId" TEXT NOT NULL, "title" TEXT NOT NULL, "kind" TEXT NOT NULL DEFAULT 'PROJECT', "description" TEXT, "link" TEXT, "fileName" TEXT, "fileUrl" TEXT, "ploCodes" TEXT, "verifiedById" TEXT, "verifiedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "StudentPortfolioItem_studentId_idx" ON "StudentPortfolioItem" ("studentId");
SELECT 'done' AS result;
