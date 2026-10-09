-- Faculty profile pages and faculty details reports
CREATE TABLE IF NOT EXISTS "FacultyProfile" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE,
  "photo" TEXT,
  "designation" TEXT,
  "employmentType" TEXT,
  "dateOfJoining" TIMESTAMP(3),
  "dateOfBirth" TIMESTAMP(3),
  "gender" TEXT,
  "bloodGroup" TEXT,
  "phone" TEXT,
  "address" TEXT,
  "nextOfKinName" TEXT,
  "nextOfKinRelation" TEXT,
  "nextOfKinPhone" TEXT,
  "nextOfKinAddress" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "FacultyRecord" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "organisation" TEXT,
  "role" TEXT,
  "startYear" INTEGER,
  "endYear" INTEGER,
  "amount" TEXT,
  "status" TEXT,
  "link" TEXT,
  "details" TEXT,
  "photo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "FacultyRecord_userId_kind_idx" ON "FacultyRecord"("userId", "kind");
