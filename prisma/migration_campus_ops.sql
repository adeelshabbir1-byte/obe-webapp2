-- Campus operations: visit day, mock visit, FDP, leave types, facility booking, meetings, faculty meals, past data for prediction. Safe to rerun.
CREATE TABLE IF NOT EXISTS "VisitDayItem" (
  "id" TEXT NOT NULL,
  "chairmanId" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'PLAN',
  "dayDate" TIMESTAMP(3),
  "startTime" TEXT,
  "endTime" TEXT,
  "title" TEXT NOT NULL,
  "place" TEXT,
  "category" TEXT,
  "ownerId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "note" TEXT,
  "orderNo" INTEGER NOT NULL DEFAULT 0,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VisitDayItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VisitDayItem_cycleId_kind_idx" ON "VisitDayItem"("cycleId", "kind");
CREATE TABLE IF NOT EXISTS "MockVisitFinding" (
  "id" TEXT NOT NULL,
  "chairmanId" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "area" TEXT NOT NULL,
  "finding" TEXT NOT NULL,
  "recommendation" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
  "ownerId" TEXT,
  "dueDate" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "doneNote" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "MockVisitFinding_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MockVisitFinding_cycleId_idx" ON "MockVisitFinding"("cycleId");
CREATE INDEX IF NOT EXISTS "MockVisitFinding_ownerId_idx" ON "MockVisitFinding"("ownerId");
CREATE TABLE IF NOT EXISTS "FdpSession" (
  "id" TEXT NOT NULL,
  "chairmanId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'WORKSHOP',
  "topic" TEXT,
  "date" TIMESTAMP(3) NOT NULL,
  "hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "facilitator" TEXT,
  "venue" TEXT,
  "audience" TEXT,
  "reason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FdpSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FdpSession_chairmanId_date_idx" ON "FdpSession"("chairmanId", "date");
CREATE TABLE IF NOT EXISTS "FdpAttendance" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "attended" BOOLEAN NOT NULL DEFAULT true,
  "certificateNo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FdpAttendance_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FdpAttendance_userId_idx" ON "FdpAttendance"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "FdpAttendance_sessionId_userId_key" ON "FdpAttendance"("sessionId", "userId");
CREATE TABLE IF NOT EXISTS "FdpExternal" (
  "id" TEXT NOT NULL,
  "chairmanId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "organizer" TEXT,
  "date" TIMESTAMP(3) NOT NULL,
  "hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FdpExternal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FdpExternal_userId_idx" ON "FdpExternal"("userId");
CREATE TABLE IF NOT EXISTS "FdpTarget" (
  "id" TEXT NOT NULL,
  "chairmanId" TEXT NOT NULL,
  "hoursPerYear" DOUBLE PRECISION NOT NULL DEFAULT 20,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FdpTarget_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FdpTarget_chairmanId_key" ON "FdpTarget"("chairmanId");
CREATE TABLE IF NOT EXISTS "LeavePolicy" (
  "id" TEXT NOT NULL,
  "chairmanId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "perYear" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "carryMax" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "needsDean" BOOLEAN NOT NULL DEFAULT false,
  "maxDays" DOUBLE PRECISION,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeavePolicy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LeavePolicy_chairmanId_kind_key" ON "LeavePolicy"("chairmanId", "kind");
CREATE TABLE IF NOT EXISTS "LeaveDetail" (
  "id" TEXT NOT NULL,
  "leaveId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "days" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "deanStatus" TEXT NOT NULL DEFAULT 'NONE',
  "hodId" TEXT,
  "hodAt" TIMESTAMP(3),
  "deanId" TEXT,
  "deanAt" TIMESTAMP(3),
  "deanNote" TEXT,
  CONSTRAINT "LeaveDetail_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LeaveDetail_leaveId_key" ON "LeaveDetail"("leaveId");
CREATE TABLE IF NOT EXISTS "FacilityBooking" (
  "id" TEXT NOT NULL,
  "chairmanId" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "roomId" TEXT,
  "date" TIMESTAMP(3) NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "bookedById" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'BOOKED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FacilityBooking_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FacilityBooking_chairmanId_date_idx" ON "FacilityBooking"("chairmanId", "date");
CREATE TABLE IF NOT EXISTS "MeetingExtra" (
  "id" TEXT NOT NULL,
  "meetingId" TEXT NOT NULL,
  "venue" TEXT,
  "startTime" TEXT,
  "agenda" TEXT,
  "inviteesJson" TEXT,
  "attendedJson" TEXT,
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  CONSTRAINT "MeetingExtra_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MeetingExtra_meetingId_key" ON "MeetingExtra"("meetingId");
CREATE TABLE IF NOT EXISTS "MeetingAction" (
  "id" TEXT NOT NULL,
  "meetingId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "ownerId" TEXT,
  "dueDate" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "doneAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MeetingAction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MeetingAction_meetingId_idx" ON "MeetingAction"("meetingId");
CREATE INDEX IF NOT EXISTS "MeetingAction_ownerId_idx" ON "MeetingAction"("ownerId");
CREATE TABLE IF NOT EXISTS "FacultyMeal" (
  "id" TEXT NOT NULL,
  "chairmanId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "item" TEXT NOT NULL,
  "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "cutoff" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FacultyMeal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FacultyMeal_chairmanId_date_idx" ON "FacultyMeal"("chairmanId", "date");
CREATE TABLE IF NOT EXISTS "MealOrder" (
  "id" TEXT NOT NULL,
  "mealId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "qty" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MealOrder_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MealOrder_userId_idx" ON "MealOrder"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "MealOrder_mealId_userId_key" ON "MealOrder"("mealId", "userId");
CREATE TABLE IF NOT EXISTS "HistoricalRecord" (
  "id" TEXT NOT NULL,
  "chairmanId" TEXT NOT NULL,
  "program" TEXT NOT NULL,
  "intakeYear" INTEGER NOT NULL,
  "rollNumber" TEXT NOT NULL,
  "semester" INTEGER NOT NULL,
  "termName" TEXT,
  "termYear" INTEGER,
  "courseCode" TEXT NOT NULL,
  "creditHours" DOUBLE PRECISION NOT NULL DEFAULT 3,
  "marksPct" DOUBLE PRECISION,
  "attendancePct" DOUBLE PRECISION,
  "grade" TEXT,
  "gpaPoints" DOUBLE PRECISION,
  "outcome" TEXT,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HistoricalRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "HistoricalRecord_chairmanId_program_idx" ON "HistoricalRecord"("chairmanId", "program");
CREATE INDEX IF NOT EXISTS "HistoricalRecord_chairmanId_courseCode_idx" ON "HistoricalRecord"("chairmanId", "courseCode");
