-- Result approval (submit -> approve -> locked) and grade-change requests after approval.
CREATE TABLE IF NOT EXISTS "CourseResult" (
  "id" TEXT PRIMARY KEY,
  "courseId" TEXT NOT NULL UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "termName" TEXT,
  "termYear" INTEGER,
  "submittedById" TEXT,
  "submittedAt" TIMESTAMP(3),
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  "note" TEXT,
  "summaryJson" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "GradeChangeRequest" (
  "id" TEXT PRIMARY KEY,
  "courseId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "oldGrade" TEXT NOT NULL,
  "newGrade" TEXT NOT NULL,
  "totalPct" DOUBLE PRECISION,
  "reason" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  "decisionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "GradeChangeRequest_courseId_idx" ON "GradeChangeRequest"("courseId");
CREATE INDEX IF NOT EXISTS "GradeChangeRequest_studentId_idx" ON "GradeChangeRequest"("studentId");
