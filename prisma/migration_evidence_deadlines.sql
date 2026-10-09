-- Accreditation evidence, course folders, deadlines, office hours
ALTER TABLE "FacultyProfile" ADD COLUMN IF NOT EXISTS "officeHours" TEXT;

CREATE TABLE IF NOT EXISTS "ProgramEvidence" (
  "id" TEXT PRIMARY KEY, "coordinatorId" TEXT NOT NULL, "area" TEXT NOT NULL, "kind" TEXT NOT NULL, "title" TEXT NOT NULL,
  "organization" TEXT, "date" TIMESTAMP(3), "count" INTEGER, "target" DOUBLE PRECISION, "actual" DOUBLE PRECISION, "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ProgramEvidence_coordinatorId_area_idx" ON "ProgramEvidence"("coordinatorId","area");

CREATE TABLE IF NOT EXISTS "CourseFolder" (
  "id" TEXT PRIMARY KEY, "courseId" TEXT NOT NULL, "coordinatorId" TEXT NOT NULL, "kept" BOOLEAN NOT NULL DEFAULT false, "note" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CourseFolder_courseId_key" ON "CourseFolder"("courseId");
CREATE INDEX IF NOT EXISTS "CourseFolder_coordinatorId_idx" ON "CourseFolder"("coordinatorId");

CREATE TABLE IF NOT EXISTS "Deadline" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "assigneeId" TEXT NOT NULL, "setById" TEXT NOT NULL, "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL, "description" TEXT, "courseId" TEXT, "dueDate" TIMESTAMP(3) NOT NULL, "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Deadline_chairmanId_idx" ON "Deadline"("chairmanId");
CREATE INDEX IF NOT EXISTS "Deadline_assigneeId_idx" ON "Deadline"("assigneeId");
