-- Students held back by the Program Lead: how many semesters behind their batch's calendar semester they stay.
-- Everyone else follows the calendar automatically. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "StudentHoldBack" (
  "id" TEXT NOT NULL, "studentId" TEXT NOT NULL, "lag" INTEGER NOT NULL DEFAULT 1, "reason" TEXT, "setById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentHoldBack_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StudentHoldBack_studentId_key" ON "StudentHoldBack"("studentId");
