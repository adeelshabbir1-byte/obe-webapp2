-- Degree issuance and verification: clearance (library, fee, hostel, department), the degree serial register (also for
-- degrees issued before OBEHUB), convocations, and verification requests from HEC, employers and others.
-- Safe to run more than once.
CREATE TABLE IF NOT EXISTS "DegreeClearance" (
  "studentId" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "libraryAt" TIMESTAMP(3), "libraryById" TEXT, "libraryNote" TEXT,
  "feeAt" TIMESTAMP(3), "feeById" TEXT, "feeNote" TEXT,
  "hostelAt" TIMESTAMP(3), "hostelById" TEXT, "hostelNote" TEXT,
  "departmentAt" TIMESTAMP(3), "departmentById" TEXT, "departmentNote" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "DegreeClearance_chairmanId_idx" ON "DegreeClearance" ("chairmanId");
CREATE TABLE IF NOT EXISTS "Convocation" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "venue" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Convocation_chairmanId_idx" ON "Convocation" ("chairmanId");
CREATE TABLE IF NOT EXISTS "DegreeIssue" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "studentId" TEXT,
  "rollNumber" TEXT NOT NULL,
  "studentName" TEXT NOT NULL,
  "fatherName" TEXT,
  "program" TEXT NOT NULL,
  "degreeTitle" TEXT NOT NULL,
  "cgpa" DOUBLE PRECISION,
  "serialNo" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL,
  "convocationId" TEXT,
  "issuedById" TEXT NOT NULL,
  "cancelledAt" TIMESTAMP(3),
  "cancelNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "DegreeIssue_chairmanId_serialNo_key" ON "DegreeIssue" ("chairmanId", "serialNo");
CREATE INDEX IF NOT EXISTS "DegreeIssue_chairmanId_rollNumber_idx" ON "DegreeIssue" ("chairmanId", "rollNumber");
CREATE TABLE IF NOT EXISTS "DegreeVerification" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "requesterKind" TEXT NOT NULL,
  "requesterName" TEXT NOT NULL,
  "reference" TEXT,
  "rollNumber" TEXT,
  "serialNo" TEXT,
  "studentName" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "degreeIssueId" TEXT,
  "response" TEXT,
  "responseNote" TEXT,
  "respondedAt" TIMESTAMP(3),
  "respondedById" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "DegreeVerification_chairmanId_idx" ON "DegreeVerification" ("chairmanId");
SELECT 'done' AS result;
