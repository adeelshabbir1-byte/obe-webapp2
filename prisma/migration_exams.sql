-- Exam management: exam sessions (date sheet rules) and papers (date, slot, rooms, seating, invigilators).
CREATE TABLE IF NOT EXISTS "ExamSession" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "examType" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "slotsJson" TEXT NOT NULL,
  "offDaysJson" TEXT NOT NULL DEFAULT '[0]',
  "maxPerDay" INTEGER NOT NULL DEFAULT 2,
  "seatPercent" INTEGER NOT NULL DEFAULT 50,
  "invigilatorsPerRoom" INTEGER NOT NULL DEFAULT 1,
  "includeLabs" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ExamSession_chairmanId_idx" ON "ExamSession"("chairmanId");
CREATE TABLE IF NOT EXISTS "ExamPaper" (
  "id" TEXT PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "date" TIMESTAMP(3),
  "slot" INTEGER,
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "roomsJson" TEXT NOT NULL DEFAULT '[]',
  "invigilatorsJson" TEXT NOT NULL DEFAULT '[]',
  UNIQUE ("sessionId", "courseId")
);
CREATE INDEX IF NOT EXISTS "ExamPaper_sessionId_idx" ON "ExamPaper"("sessionId");
