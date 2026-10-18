-- NCEAC AAS: values people type for the AAS forms that OBEHUB cannot work out (CNICs, dates, narratives, yes/no answers). Safe to run more than once.
CREATE TABLE IF NOT EXISTS "AasRecord" ("id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "scope" TEXT NOT NULL, "key" TEXT NOT NULL, "dataJson" TEXT NOT NULL DEFAULT '{}', "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX IF NOT EXISTS "AasRecord_chairmanId_scope_key_key" ON "AasRecord" ("chairmanId", "scope", "key");
-- Personal and academic details NCEAC asks for, kept with each student and each staff member (keys follow the AAS fields).
CREATE TABLE IF NOT EXISTS "StudentDetail" ("studentId" TEXT PRIMARY KEY, "dataJson" TEXT NOT NULL DEFAULT '{}', "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS "StaffDetail" ("userId" TEXT PRIMARY KEY, "dataJson" TEXT NOT NULL DEFAULT '{}', "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
SELECT 'done' AS result;
