-- Run in Supabase SQL Editor. Adds the full Timetable module: rooms,
-- schedulable sections, per-batch scheduling windows, faculty
-- unavailability (both PC-set and self-set), and generated timetable runs
-- with their entries.

CREATE TABLE IF NOT EXISTS "Room" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "chairmanId" TEXT NOT NULL REFERENCES "User"("id"),
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "capacity" INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "Room_chairmanId_name_key" ON "Room"("chairmanId", "name");
CREATE INDEX IF NOT EXISTS "Room_chairmanId_idx" ON "Room"("chairmanId");

CREATE TABLE IF NOT EXISTS "ScheduleSection" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "courseId" TEXT NOT NULL REFERENCES "Course"("id"),
  "instructorId" TEXT NOT NULL REFERENCES "User"("id"),
  "sectionLabel" TEXT NOT NULL DEFAULT 'Section A',
  "sessionsPerWeek" INTEGER NOT NULL DEFAULT 3,
  "sessionDurationMinutes" INTEGER NOT NULL DEFAULT 60,
  "roomTypeNeeded" TEXT NOT NULL DEFAULT 'LECTURE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ScheduleSection_courseId_idx" ON "ScheduleSection"("courseId");
CREATE INDEX IF NOT EXISTS "ScheduleSection_instructorId_idx" ON "ScheduleSection"("instructorId");

CREATE TABLE IF NOT EXISTS "BatchScheduleConfig" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "batchId" TEXT NOT NULL UNIQUE REFERENCES "Batch"("id"),
  "workingDaysJson" TEXT NOT NULL DEFAULT '["Mon","Tue","Wed","Thu","Fri"]',
  "dailyStartHour" INTEGER NOT NULL DEFAULT 8,
  "dailyEndHour" INTEGER NOT NULL DEFAULT 16
);

CREATE TABLE IF NOT EXISTS "FacultyUnavailability" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "facultyId" TEXT NOT NULL REFERENCES "User"("id"),
  "dayOfWeek" TEXT NOT NULL,
  "startHour" DOUBLE PRECISION NOT NULL,
  "endHour" DOUBLE PRECISION NOT NULL,
  "setById" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "FacultyUnavailability_facultyId_idx" ON "FacultyUnavailability"("facultyId");

CREATE TABLE IF NOT EXISTS "TimetableRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "chairmanId" TEXT NOT NULL REFERENCES "User"("id"),
  "generatedById" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "fitnessScore" DOUBLE PRECISION,
  "hardViolations" INTEGER,
  "generations" INTEGER,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "TimetableRun_chairmanId_idx" ON "TimetableRun"("chairmanId");

CREATE TABLE IF NOT EXISTS "TimetableEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "timetableRunId" TEXT NOT NULL REFERENCES "TimetableRun"("id"),
  "scheduleSectionId" TEXT NOT NULL REFERENCES "ScheduleSection"("id"),
  "roomId" TEXT NOT NULL REFERENCES "Room"("id"),
  "dayOfWeek" TEXT NOT NULL,
  "startHour" DOUBLE PRECISION NOT NULL,
  "endHour" DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS "TimetableEntry_timetableRunId_idx" ON "TimetableEntry"("timetableRunId");
CREATE INDEX IF NOT EXISTS "TimetableEntry_scheduleSectionId_idx" ON "TimetableEntry"("scheduleSectionId");
CREATE INDEX IF NOT EXISTS "TimetableEntry_roomId_idx" ON "TimetableEntry"("roomId");
