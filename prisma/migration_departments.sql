-- Departments, heads of department, visiting-faculty placeholder, subject-home tag. Safe to re-run.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'HEAD_OF_DEPARTMENT';
CREATE TABLE IF NOT EXISTS "Department" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "Department_chairmanId_name_key" ON "Department"("chairmanId", "name");
CREATE INDEX IF NOT EXISTS "Department_chairmanId_idx" ON "Department"("chairmanId");

CREATE TABLE IF NOT EXISTS "DepartmentProgram" (
  "id" TEXT PRIMARY KEY,
  "departmentId" TEXT NOT NULL REFERENCES "Department"("id") ON DELETE CASCADE,
  "chairmanId" TEXT NOT NULL,
  "degreeProgram" TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "DepartmentProgram_chairmanId_degreeProgram_key" ON "DepartmentProgram"("chairmanId", "degreeProgram");
CREATE INDEX IF NOT EXISTS "DepartmentProgram_departmentId_idx" ON "DepartmentProgram"("departmentId");

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "departmentId" TEXT REFERENCES "Department"("id") ON DELETE SET NULL;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isVisitingPlaceholder" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "subjectHomeDepartmentId" TEXT REFERENCES "Department"("id") ON DELETE SET NULL;

-- Everything that exists today moves into one default department per institute, so nothing breaks.
INSERT INTO "Department" ("id", "chairmanId", "name")
SELECT gen_random_uuid()::text, u."id", 'Main Department' FROM "User" u WHERE u."role" = 'CHAIRMAN'
ON CONFLICT DO NOTHING;

-- Coordinators, course assigners and OMC members (managed directly by the chairman)
UPDATE "User" x SET "departmentId" = d."id"
FROM "Department" d WHERE d."chairmanId" = x."managedById" AND d."name" = 'Main Department'
  AND x."role" IN ('PROGRAM_COORDINATOR', 'COURSE_ASSIGNER', 'OMC') AND x."departmentId" IS NULL;

-- Faculty (managed by a coordinator)
UPDATE "User" f SET "departmentId" = c."departmentId"
FROM "User" c WHERE f."managedById" = c."id" AND c."role" = 'PROGRAM_COORDINATOR'
  AND f."role" IN ('INSTRUCTOR', 'SUBJECT_EXPERT') AND f."departmentId" IS NULL;

-- Every degree program currently in use goes to the default department
INSERT INTO "DepartmentProgram" ("id", "departmentId", "chairmanId", "degreeProgram")
SELECT DISTINCT ON (c."managedById", b."degreeProgram") gen_random_uuid()::text, d."id", c."managedById", b."degreeProgram"
FROM "Batch" b JOIN "User" c ON c."id" = b."coordinatorId"
JOIN "Department" d ON d."chairmanId" = c."managedById" AND d."name" = 'Main Department'
WHERE c."role" = 'PROGRAM_COORDINATOR'
ON CONFLICT DO NOTHING;
