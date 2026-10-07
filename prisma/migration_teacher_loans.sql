-- Step 3 of Departments: borrow a teacher from another department.
CREATE TABLE IF NOT EXISTS "TeacherLoanRequest" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL REFERENCES "Course"("id") ON DELETE CASCADE,
  "instructorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "requestingDepartmentId" TEXT NOT NULL REFERENCES "Department"("id") ON DELETE CASCADE,
  "lendingDepartmentId" TEXT NOT NULL REFERENCES "Department"("id") ON DELETE CASCADE,
  "requestedById" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "note" TEXT,
  "decisionNote" TEXT,
  "decidedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "TeacherLoanRequest_chairmanId_status_idx" ON "TeacherLoanRequest"("chairmanId","status");
CREATE INDEX IF NOT EXISTS "TeacherLoanRequest_lendingDepartmentId_status_idx" ON "TeacherLoanRequest"("lendingDepartmentId","status");
CREATE INDEX IF NOT EXISTS "TeacherLoanRequest_courseId_idx" ON "TeacherLoanRequest"("courseId");
