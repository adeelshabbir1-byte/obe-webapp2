-- Course split: which Program Lead handles each course in a department.
CREATE TABLE IF NOT EXISTS "CourseOwner" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "courseKey" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "assignedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CourseOwner_chairmanId_departmentId_courseKey_key" ON "CourseOwner"("chairmanId","departmentId","courseKey");
CREATE INDEX IF NOT EXISTS "CourseOwner_ownerId_idx" ON "CourseOwner"("ownerId");
