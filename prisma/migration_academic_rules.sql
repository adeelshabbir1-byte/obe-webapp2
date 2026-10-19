-- Academic rules (Controller of Examinations), registration holds of low-CGPA students, and student photos. Safe to rerun.
CREATE TABLE IF NOT EXISTS "AcademicRule" (
  "id" TEXT NOT NULL, "chairmanId" TEXT NOT NULL,
  "warningCgpa" DOUBLE PRECISION NOT NULL DEFAULT 2.5, "probationCgpa" DOUBLE PRECISION NOT NULL DEFAULT 2.0, "holdCgpa" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
  "dismissCgpa" DOUBLE PRECISION NOT NULL DEFAULT 1.5, "dismissAfterProbations" INTEGER NOT NULL DEFAULT 2, "minAttendanceForExam" DOUBLE PRECISION NOT NULL DEFAULT 75,
  "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AcademicRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AcademicRule_chairmanId_key" ON "AcademicRule"("chairmanId");
CREATE TABLE IF NOT EXISTS "RegistrationHold" (
  "id" TEXT NOT NULL, "studentId" TEXT NOT NULL, "batchId" TEXT NOT NULL, "term" TEXT NOT NULL, "cgpa" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "advisorId" TEXT, "coursesJson" TEXT, "note" TEXT, "decidedById" TEXT, "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RegistrationHold_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RegistrationHold_studentId_term_key" ON "RegistrationHold"("studentId", "term");
CREATE INDEX IF NOT EXISTS "RegistrationHold_advisorId_status_idx" ON "RegistrationHold"("advisorId", "status");
CREATE INDEX IF NOT EXISTS "RegistrationHold_batchId_idx" ON "RegistrationHold"("batchId");
CREATE TABLE IF NOT EXISTS "StudentPhoto" (
  "studentId" TEXT NOT NULL, "photo" TEXT NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentPhoto_pkey" PRIMARY KEY ("studentId")
);
