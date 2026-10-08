-- Course split across departments: another department's Program Lead can take a course once its Chairman accepts.
ALTER TABLE "CourseOwner" ADD COLUMN IF NOT EXISTS "ownerDepartmentId" TEXT;
ALTER TABLE "CourseOwner" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACCEPTED';
UPDATE "CourseOwner" SET "ownerDepartmentId" = "departmentId" WHERE "ownerDepartmentId" IS NULL;
