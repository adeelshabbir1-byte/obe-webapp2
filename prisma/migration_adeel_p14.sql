-- Queue items 21 and 23 (7 Nov 2026): faculty status (degree, designation, NCEAC class), accreditation requirement
-- versions, letters exchanged with NCEAC / HEC, and one table for the network-degree records. Only new tables.
-- Safe to run more than once.
CREATE TABLE IF NOT EXISTS "FacultyStatus" ("userId" TEXT PRIMARY KEY, "degree" TEXT, "designation" TEXT, "employment" TEXT, "facultyClass" TEXT, "aqpq" TEXT, "note" TEXT, "byId" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS "AccreditationRuleVersion" ("id" TEXT PRIMARY KEY, "body" TEXT NOT NULL, "label" TEXT NOT NULL, "fromTerm" TEXT NOT NULL, "fromYear" INTEGER NOT NULL, "rulesJson" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'ACTIVE', "note" TEXT, "byId" TEXT NOT NULL, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "AccreditationRuleVersion_body_idx" ON "AccreditationRuleVersion"("body");
CREATE TABLE IF NOT EXISTS "AccreditationLetter" ("id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "program" TEXT, "cycleId" TEXT, "counterpart" TEXT NOT NULL, "direction" TEXT NOT NULL, "kind" TEXT NOT NULL, "refNo" TEXT, "letterDate" TIMESTAMP(3), "subject" TEXT NOT NULL, "fileUrl" TEXT, "fileName" TEXT, "byId" TEXT NOT NULL, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "AccreditationLetter_chairman_idx" ON "AccreditationLetter"("chairmanId");
CREATE TABLE IF NOT EXISTS "NetRecord" ("id" TEXT PRIMARY KEY, "kind" TEXT NOT NULL, "chairmanId" TEXT NOT NULL, "refId" TEXT, "status" TEXT NOT NULL DEFAULT 'OPEN', "json" TEXT NOT NULL DEFAULT '{}', "byId" TEXT NOT NULL, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "NetRecord_kind_chairman_idx" ON "NetRecord"("kind", "chairmanId");
CREATE INDEX IF NOT EXISTS "NetRecord_kind_ref_idx" ON "NetRecord"("kind", "refId");
