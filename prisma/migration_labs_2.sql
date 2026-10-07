-- Part 2: run after migration_labs.sql
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "labEngineerId" TEXT REFERENCES "User"("id");

CREATE TABLE IF NOT EXISTS "LabManual" (
  "id" TEXT PRIMARY KEY,
  "courseId" TEXT NOT NULL REFERENCES "Course"("id") ON DELETE CASCADE,
  "labNumber" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "LabManual_courseId_labNumber_key" ON "LabManual"("courseId","labNumber");

CREATE TABLE IF NOT EXISTS "LabManualVersion" (
  "id" TEXT PRIMARY KEY,
  "manualId" TEXT NOT NULL REFERENCES "LabManual"("id") ON DELETE CASCADE,
  "version" INTEGER NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "LabManualVersion_manualId_version_key" ON "LabManualVersion"("manualId","version");

CREATE TABLE IF NOT EXISTS "LabMark" (
  "id" TEXT PRIMARY KEY,
  "courseId" TEXT NOT NULL REFERENCES "Course"("id") ON DELETE CASCADE,
  "studentId" TEXT NOT NULL REFERENCES "Student"("id") ON DELETE CASCADE,
  "labNumber" INTEGER NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "maxScore" DOUBLE PRECISION NOT NULL,
  "enteredById" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "LabMark_courseId_studentId_labNumber_key" ON "LabMark"("courseId","studentId","labNumber");
CREATE INDEX IF NOT EXISTS "LabMark_courseId_idx" ON "LabMark"("courseId");
