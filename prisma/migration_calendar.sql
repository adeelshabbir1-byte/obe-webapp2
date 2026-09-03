-- Run in Supabase SQL Editor. Adds exam dates on Course, plus Holiday and
-- ClassDayMode tables for the Coordinator's calendar and the Instructor's
-- auto-fill lecture dates feature.

ALTER TABLE "Course"
  ADD COLUMN IF NOT EXISTS "midtermDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "finalDate" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "Holiday" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "coordinatorId" TEXT NOT NULL REFERENCES "User"("id"),
  "date" TIMESTAMP(3) NOT NULL,
  "label" TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "Holiday_coordinatorId_date_key" ON "Holiday"("coordinatorId", "date");
CREATE INDEX IF NOT EXISTS "Holiday_coordinatorId_idx" ON "Holiday"("coordinatorId");

CREATE TABLE IF NOT EXISTS "ClassDayMode" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "coordinatorId" TEXT NOT NULL REFERENCES "User"("id"),
  "date" TIMESTAMP(3) NOT NULL,
  "mode" TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ClassDayMode_coordinatorId_date_key" ON "ClassDayMode"("coordinatorId", "date");
CREATE INDEX IF NOT EXISTS "ClassDayMode_coordinatorId_idx" ON "ClassDayMode"("coordinatorId");
