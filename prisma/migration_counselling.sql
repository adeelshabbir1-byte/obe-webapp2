-- Counselling appointments (Prompt 2 item 4) and in-app notices for students (the student bell). Safe to run more than once.
CREATE TABLE IF NOT EXISTS "CounsellorProfile" (
  "userId" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "isCounsellor" BOOLEAN NOT NULL DEFAULT false, "byRequest" BOOLEAN NOT NULL DEFAULT false,
  "note" TEXT, "designatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CounsellorProfile_chairmanId_idx" ON "CounsellorProfile" ("chairmanId");
CREATE TABLE IF NOT EXISTS "CounsellingSlot" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "counsellorId" TEXT NOT NULL, "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'IN_PERSON', "place" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CounsellingSlot_counsellorId_startsAt_idx" ON "CounsellingSlot" ("counsellorId", "startsAt");
CREATE TABLE IF NOT EXISTS "CounsellingBooking" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "studentId" TEXT NOT NULL, "counsellorId" TEXT NOT NULL, "slotId" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'ACADEMIC', "mode" TEXT NOT NULL DEFAULT 'IN_PERSON', "startsAt" TIMESTAMP(3), "status" TEXT NOT NULL DEFAULT 'BOOKED',
  "reason" TEXT, "source" TEXT NOT NULL DEFAULT 'SELF', "calledById" TEXT, "reminderSentAt" TIMESTAMP(3), "doneAt" TIMESTAMP(3), "followUpDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CounsellingBooking_counsellorId_idx" ON "CounsellingBooking" ("counsellorId", "startsAt");
CREATE INDEX IF NOT EXISTS "CounsellingBooking_studentId_idx" ON "CounsellingBooking" ("studentId");
CREATE UNIQUE INDEX IF NOT EXISTS "CounsellingBooking_slotId_key" ON "CounsellingBooking" ("slotId") WHERE "slotId" IS NOT NULL AND "status" IN ('BOOKED','DONE');
CREATE TABLE IF NOT EXISTS "CounsellingNote" (
  "id" TEXT PRIMARY KEY, "bookingId" TEXT NOT NULL, "authorId" TEXT NOT NULL, "kind" TEXT NOT NULL, "notes" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CounsellingNote_bookingId_idx" ON "CounsellingNote" ("bookingId");
CREATE TABLE IF NOT EXISTS "StudentNotice" (
  "id" TEXT PRIMARY KEY, "studentId" TEXT NOT NULL, "kind" TEXT NOT NULL, "title" TEXT NOT NULL, "body" TEXT, "href" TEXT,
  "readAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "StudentNotice_studentId_createdAt_idx" ON "StudentNotice" ("studentId", "createdAt");
SELECT 'done' AS result;
