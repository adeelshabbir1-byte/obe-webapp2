-- QR attendance: live attendance sessions with a rotating encrypted QR code, each student's check-in, the institute's
-- attendance policy (late / excused handling and QR defaults) and the shortage flags shown to students and Program Leads.
-- Run in the Supabase SQL editor AFTER migration_help_center.sql. Safe to run more than once.

-- AlterTable
ALTER TABLE "AttendanceThreshold" ADD COLUMN IF NOT EXISTS "excusedExcluded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "lateCountsPresent" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "qrLateMinutes" INTEGER NOT NULL DEFAULT 25,
ADD COLUMN IF NOT EXISTS "qrPresentMinutes" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN IF NOT EXISTS "qrRotateSeconds" INTEGER NOT NULL DEFAULT 12,
ADD COLUMN IF NOT EXISTS "warnMarginPct" INTEGER NOT NULL DEFAULT 5;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AttendanceSession" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "lectureRowId" TEXT NOT NULL,
    "instructorId" TEXT NOT NULL,
    "chairmanId" TEXT,
    "keyHex" TEXT NOT NULL,
    "rotateSeconds" INTEGER NOT NULL DEFAULT 12,
    "presentMinutes" INTEGER NOT NULL DEFAULT 10,
    "lateMinutes" INTEGER NOT NULL DEFAULT 25,
    "requireLogin" BOOLEAN NOT NULL DEFAULT true,
    "sameNetwork" BOOLEAN NOT NULL DEFAULT false,
    "networkKey" TEXT,
    "checkLocation" BOOLEAN NOT NULL DEFAULT false,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "radiusM" INTEGER NOT NULL DEFAULT 150,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "absentMarked" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AttendanceCheckin" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "deviceId" TEXT,
    "userAgent" TEXT,
    "distanceM" INTEGER,
    "note" TEXT,
    "byUserId" TEXT,
    "duplicateAttempts" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceCheckin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AttendanceFlag" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "chairmanId" TEXT,
    "status" TEXT NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "firstFlaggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),
    "clearedAt" TIMESTAMP(3),

    CONSTRAINT "AttendanceFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AttendanceSession_courseId_idx" ON "AttendanceSession"("courseId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AttendanceSession_instructorId_status_idx" ON "AttendanceSession"("instructorId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AttendanceSession_status_closesAt_idx" ON "AttendanceSession"("status", "closesAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AttendanceCheckin_sessionId_deviceId_idx" ON "AttendanceCheckin"("sessionId", "deviceId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceCheckin_sessionId_studentId_key" ON "AttendanceCheckin"("sessionId", "studentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AttendanceFlag_courseId_idx" ON "AttendanceFlag"("courseId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AttendanceFlag_chairmanId_status_idx" ON "AttendanceFlag"("chairmanId", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceFlag_studentId_courseId_key" ON "AttendanceFlag"("studentId", "courseId");
