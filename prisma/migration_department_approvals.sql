-- Step 2 of Departments: head-of-department approval of teacher assignments.
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "instructorApproval" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "instructorApprovalNote" TEXT;
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "instructorApprovedById" TEXT;
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "instructorApprovedAt" TIMESTAMP(3);
-- Teachers already assigned before this feature are treated as approved.
UPDATE "Course" SET "instructorApproval" = 'APPROVED' WHERE "instructorId" IS NOT NULL AND "instructorApproval" = 'NONE';
