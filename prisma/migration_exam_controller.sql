-- Controller of Examinations: result publication, re-checking requests, debarred (short attendance) lists.
CREATE TABLE IF NOT EXISTS "ResultPublication" (
  "courseId" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedById" TEXT NOT NULL,
  "recheckUntil" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "ResultPublication_chairmanId_idx" ON "ResultPublication"("chairmanId");

CREATE TABLE IF NOT EXISTS "ResultRecheck" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "note" TEXT,
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ResultRecheck_courseId_studentId_key" ON "ResultRecheck"("courseId","studentId");
CREATE INDEX IF NOT EXISTS "ResultRecheck_chairmanId_status_idx" ON "ResultRecheck"("chairmanId","status");

CREATE TABLE IF NOT EXISTS "DebarEntry" (
  "id" TEXT PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "pct" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DEBARRED',
  "note" TEXT,
  "decidedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "DebarEntry_sessionId_courseId_studentId_key" ON "DebarEntry"("sessionId","courseId","studentId");
CREATE INDEX IF NOT EXISTS "DebarEntry_studentId_idx" ON "DebarEntry"("studentId");
