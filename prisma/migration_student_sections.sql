-- Student sections for the department timetable: a batch over the section limit (default 50) is split into Section A, B,
-- C… shared by all its courses; which student is in which section; which student sections each timetable section
-- covers (so a combined class never holds more than the limit); sections retired by a re-generate; and the limit itself
-- per timetable. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "BatchStudentSection" (
  "batchId" TEXT NOT NULL, "label" TEXT NOT NULL, "size" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY ("batchId", "label")
);
CREATE TABLE IF NOT EXISTS "StudentSectionMember" (
  "studentId" TEXT PRIMARY KEY, "batchId" TEXT NOT NULL, "label" TEXT NOT NULL, "manual" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "StudentSectionMember_batchId_idx" ON "StudentSectionMember"("batchId", "label");
CREATE TABLE IF NOT EXISTS "ScheduleSectionCover" (
  "scheduleSectionId" TEXT NOT NULL, "batchId" TEXT NOT NULL, "label" TEXT NOT NULL, "size" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("scheduleSectionId", "batchId", "label")
);
CREATE INDEX IF NOT EXISTS "ScheduleSectionCover_batchId_idx" ON "ScheduleSectionCover"("batchId");
CREATE TABLE IF NOT EXISTS "ScheduleSectionRetired" (
  "scheduleSectionId" TEXT PRIMARY KEY, "note" TEXT, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "TimetableSetting" (
  "chairmanId" TEXT NOT NULL, "scopeKey" TEXT NOT NULL, "maxSection" INTEGER NOT NULL DEFAULT 50, "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY ("chairmanId", "scopeKey")
);
