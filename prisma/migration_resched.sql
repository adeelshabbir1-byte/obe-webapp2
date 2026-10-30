-- Smart scheduling and rescheduling: events planned before the timetable is published (they hold their slot), class
-- reschedule requests through the Chairman / Dean, Program Lead and teacher (visiting teachers must confirm), campus
-- closures (force majeure) with their make-up slots, and CQI flags for the next curriculum revision when a batch's
-- PLO attainment falls below 50%. Side tables only; safe to run more than once.
CREATE TABLE IF NOT EXISTS "PlannedEvent" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "title" TEXT NOT NULL, "date" TIMESTAMP(3) NOT NULL, "startHour" DOUBLE PRECISION NOT NULL,
  "endHour" DOUBLE PRECISION NOT NULL, "batchIdsJson" TEXT NOT NULL DEFAULT '[]', "beforePublication" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PlannedEvent_chairman_idx" ON "PlannedEvent"("chairmanId", "date");
CREATE TABLE IF NOT EXISTS "ClassReschedule" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "eventId" TEXT, "entryId" TEXT NOT NULL, "courseId" TEXT NOT NULL,
  "fromDate" TIMESTAMP(3) NOT NULL, "fromStart" DOUBLE PRECISION NOT NULL, "fromEnd" DOUBLE PRECISION NOT NULL,
  "toDate" TIMESTAMP(3) NOT NULL, "toStart" DOUBLE PRECISION NOT NULL, "toEnd" DOUBLE PRECISION NOT NULL, "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_DEAN', "visiting" BOOLEAN NOT NULL DEFAULT false, "plOk" BOOLEAN, "facultyOk" BOOLEAN,
  "deanId" TEXT, "note" TEXT, "forceMajeure" BOOLEAN NOT NULL DEFAULT false, "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ClassReschedule_chairman_idx" ON "ClassReschedule"("chairmanId", "status");
CREATE INDEX IF NOT EXISTS "ClassReschedule_course_idx" ON "ClassReschedule"("courseId");
CREATE TABLE IF NOT EXISTS "CampusClosure" ("id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "date" TIMESTAMP(3) NOT NULL, "reason" TEXT NOT NULL, "declaredById" TEXT NOT NULL, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "CampusClosure_chairman_idx" ON "CampusClosure"("chairmanId", "date");
CREATE TABLE IF NOT EXISTS "CqiRevisionFlag" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "courseId" TEXT NOT NULL, "courseCode" TEXT NOT NULL, "courseTitle" TEXT NOT NULL,
  "batchId" TEXT, "ploLabel" TEXT NOT NULL, "attainment" DOUBLE PRECISION NOT NULL, "termName" TEXT, "termYear" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "resolvedAt" TIMESTAMP(3), "resolvedById" TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS "CqiRevisionFlag_key" ON "CqiRevisionFlag"("courseId", "ploLabel");
CREATE INDEX IF NOT EXISTS "CqiRevisionFlag_chairman_idx" ON "CqiRevisionFlag"("chairmanId");
