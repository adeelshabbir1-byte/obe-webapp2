-- Step 4 of Departments: shared vs separate timetables.
ALTER TABLE "Department" ADD COLUMN IF NOT EXISTS "timetableMode" TEXT NOT NULL DEFAULT 'SHARED';
ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "departmentId" TEXT REFERENCES "Department"("id") ON DELETE SET NULL;
ALTER TABLE "TimetableRun" ADD COLUMN IF NOT EXISTS "scopeKey" TEXT;
-- Existing runs were institute-wide, i.e. the shared timetable.
UPDATE "TimetableRun" SET "scopeKey" = 'SHARED' WHERE "scopeKey" IS NULL;
