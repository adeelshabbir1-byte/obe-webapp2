-- Adeel prompt part 6: template extras per master course (topic importance / PR / book chapter, full lab plan rows,
-- questions, rubrics) imported from the full curriculum template. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "MasterCourseExtra" (
  "masterCourseId" TEXT NOT NULL, "kind" TEXT NOT NULL, "dataJson" TEXT NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("masterCourseId", "kind")
);
-- Classes in reality (Adeel prompt §22–23): one-off / permanent reschedules, cancellations, make-ups and extra bookings,
-- substitutes; the floor attendant's daily register with the Program Lead's review; private calendar / kiosk links.
CREATE TABLE IF NOT EXISTS "TimetableChange" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "entryId" TEXT, "kind" TEXT NOT NULL, "date" TIMESTAMP(3), "fromDate" TIMESTAMP(3),
  "toDay" TEXT, "toStart" DOUBLE PRECISION, "toEnd" DOUBLE PRECISION, "toRoomId" TEXT, "substituteId" TEXT, "sectionId" TEXT,
  "title" TEXT, "reason" TEXT, "status" TEXT NOT NULL DEFAULT 'ACTIVE', "byId" TEXT NOT NULL, "approvedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "TimetableChange_chairman_date_idx" ON "TimetableChange"("chairmanId", "date");
CREATE INDEX IF NOT EXISTS "TimetableChange_entry_idx" ON "TimetableChange"("entryId");
CREATE TABLE IF NOT EXISTS "FloorRegister" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "entryId" TEXT NOT NULL, "date" TIMESTAMP(3) NOT NULL, "startedAt" DOUBLE PRECISION,
  "endedAt" DOUBLE PRECISION, "roomId" TEXT, "held" BOOLEAN NOT NULL DEFAULT true, "note" TEXT, "byId" TEXT NOT NULL,
  "review" TEXT, "reviewReason" TEXT, "reviewedById" TEXT, "reviewedAt" TIMESTAMP(3), "teacherReply" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "FloorRegister_entry_date" ON "FloorRegister"("entryId", "date");
CREATE TABLE IF NOT EXISTS "TimetableToken" (
  "token" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "kind" TEXT NOT NULL, "userId" TEXT, "studentId" TEXT, "roomId" TEXT,
  "label" TEXT, "revokedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
