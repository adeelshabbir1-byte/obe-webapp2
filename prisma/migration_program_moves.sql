-- Moving a teacher between programs needs both Program Leads to accept.
CREATE TABLE IF NOT EXISTS "TeacherProgramMove" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "fromCoordinatorId" TEXT NOT NULL,
  "toCoordinatorId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "note" TEXT,
  "fromStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "toStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "TeacherProgramMove_chairmanId_status_idx" ON "TeacherProgramMove"("chairmanId","status");
CREATE INDEX IF NOT EXISTS "TeacherProgramMove_fromCoordinatorId_idx" ON "TeacherProgramMove"("fromCoordinatorId");
CREATE INDEX IF NOT EXISTS "TeacherProgramMove_toCoordinatorId_idx" ON "TeacherProgramMove"("toCoordinatorId");
