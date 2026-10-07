-- Faculty requests across departments: "any faculty" requests, lending head's allowed list, Subject Expert requests,
-- and the borrowed teacher accepting/declining the course.
ALTER TABLE "TeacherLoanRequest" ALTER COLUMN "instructorId" DROP NOT NULL;
ALTER TABLE "TeacherLoanRequest" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'INSTRUCTOR';
CREATE TABLE IF NOT EXISTS "TeacherLoanAllowed" (
  "id" TEXT PRIMARY KEY,
  "loanId" TEXT NOT NULL REFERENCES "TeacherLoanRequest"("id") ON DELETE CASCADE,
  "instructorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "TeacherLoanAllowed_loanId_instructorId_key" ON "TeacherLoanAllowed"("loanId","instructorId");
CREATE INDEX IF NOT EXISTS "TeacherLoanAllowed_instructorId_idx" ON "TeacherLoanAllowed"("instructorId");
-- Requests approved under the earlier one-teacher flow keep working: that teacher is the allowed one.
INSERT INTO "TeacherLoanAllowed" ("id","loanId","instructorId")
SELECT gen_random_uuid()::text, "id", "instructorId" FROM "TeacherLoanRequest"
WHERE "status" = 'APPROVED' AND "instructorId" IS NOT NULL
ON CONFLICT DO NOTHING;
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "instructorResponse" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "instructorResponseNote" TEXT;
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "seResponse" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "seResponseNote" TEXT;
