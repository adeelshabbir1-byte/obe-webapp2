-- Employee upload: the institute's own employee number on the faculty profile. Safe to run more than once.
ALTER TABLE "FacultyProfile" ADD COLUMN IF NOT EXISTS "employeeCode" TEXT;
SELECT 'done' AS result;
