-- OBE start term: courses taught from this term on are OBE; earlier ones are grades-only. program '' = the whole institute.
CREATE TABLE IF NOT EXISTS "ObeStart" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "program" TEXT NOT NULL DEFAULT '', "termName" TEXT NOT NULL, "termYear" INTEGER NOT NULL,
  "byId" TEXT NOT NULL, "byName" TEXT NOT NULL DEFAULT '', "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ObeStart_chairmanId_program_key" ON "ObeStart"("chairmanId", "program");
-- A single course offering marked grades-only by its Program Lead (e.g. a non-credit deficiency course), with the reason.
CREATE TABLE IF NOT EXISTS "ObeCourseOff" (
  "courseId" TEXT PRIMARY KEY, "reason" TEXT NOT NULL, "byId" TEXT NOT NULL, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
