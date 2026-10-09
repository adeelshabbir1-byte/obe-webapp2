-- Academic calendar (Institute Head / Dean) and admission criteria (Dean)
CREATE TABLE IF NOT EXISTS "AcademicCalendarEntry" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "facultyId" TEXT, "kind" TEXT NOT NULL, "title" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL, "endDate" TIMESTAMP(3), "termName" TEXT, "termYear" INTEGER,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AcademicCalendarEntry_chairmanId_idx" ON "AcademicCalendarEntry"("chairmanId");

CREATE TABLE IF NOT EXISTS "AdmissionCriteria" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "scopeKey" TEXT NOT NULL, "degreeProgram" TEXT NOT NULL, "academicYear" TEXT,
  "minPercentage" DOUBLE PRECISION, "requiredSubjects" TEXT, "entryTest" TEXT, "minTestScore" DOUBLE PRECISION, "seats" INTEGER,
  "transferPolicy" TEXT, "otherConditions" TEXT, "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "AdmissionCriteria_chairmanId_scopeKey_degreeProgram_key" ON "AdmissionCriteria"("chairmanId","scopeKey","degreeProgram");
CREATE INDEX IF NOT EXISTS "AdmissionCriteria_chairmanId_idx" ON "AdmissionCriteria"("chairmanId");
