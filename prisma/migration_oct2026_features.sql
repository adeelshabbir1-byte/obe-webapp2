-- ============================================================================
-- October 2026 batch: Dean / Instructor / OMC changes, prerequisite topics and
-- follow-ups, Topic Workspace suggestions, system feedback, facilities
-- (new Facilities Manager role), student societies, fee structure and
-- scholarships.
--
-- Run in Supabase's SQL Editor, the same way as the other migration_*.sql
-- files. Safe to run more than once (everything is IF NOT EXISTS) and it only
-- adds: no existing table or column is changed or dropped. Generated from
-- prisma/schema.prisma, so the database and the schema match exactly.
-- ============================================================================

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'FACILITIES_MANAGER';

-- AlterTable
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "instructorAssignmentBestOf" INTEGER,
ADD COLUMN IF NOT EXISTS "instructorAssignmentCount" INTEGER,
ADD COLUMN IF NOT EXISTS "instructorFinalCount" INTEGER,
ADD COLUMN IF NOT EXISTS "instructorLabCount" INTEGER,
ADD COLUMN IF NOT EXISTS "instructorMidtermCount" INTEGER,
ADD COLUMN IF NOT EXISTS "instructorProjectCount" INTEGER,
ADD COLUMN IF NOT EXISTS "instructorQuizBestOf" INTEGER,
ADD COLUMN IF NOT EXISTS "instructorQuizCount" INTEGER;

-- CreateTable
CREATE TABLE IF NOT EXISTS "TopicPrerequisite" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "coordinatorId" TEXT NOT NULL,
    "prereqCourseCode" TEXT NOT NULL,
    "prereqCourseTitle" TEXT NOT NULL,
    "prereqTopic" TEXT NOT NULL,
    "dependentCourseCode" TEXT NOT NULL,
    "dependentCourseTitle" TEXT NOT NULL,
    "dependentTopic" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopicPrerequisite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TopicFollowUp" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "coordinatorId" TEXT NOT NULL,
    "sourceCourseId" TEXT NOT NULL,
    "sourceCourseCode" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "studentsBelow" INTEGER,
    "studentsTotal" INTEGER,
    "targetCourseId" TEXT,
    "targetCourseCode" TEXT NOT NULL,
    "targetTopic" TEXT,
    "recommendation" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "assignedToId" TEXT,
    "actionTaken" TEXT,
    "actionById" TEXT,
    "actionAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopicFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TopicSuggestion" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "fromCourseId" TEXT,
    "toCourseId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "subtopic" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "respondedById" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopicSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SystemFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chairmanId" TEXT,
    "role" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "pageUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "adminReply" TEXT,
    "recognized" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FacilityBuilding" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "campus" TEXT,
    "totalAreaSqft" DOUBLE PRECISION,
    "coveredAreaSqft" DOUBLE PRECISION,
    "floors" INTEGER,
    "yearBuilt" INTEGER,
    "ownership" TEXT,
    "notes" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacilityBuilding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FacilityRoom" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roomType" TEXT NOT NULL,
    "floor" TEXT,
    "lengthFt" DOUBLE PRECISION,
    "widthFt" DOUBLE PRECISION,
    "capacity" INTEGER,
    "multimedia" BOOLEAN NOT NULL DEFAULT false,
    "airConditioned" BOOLEAN NOT NULL DEFAULT false,
    "departmentId" TEXT,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacilityRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FacilityService" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "quantity" INTEGER,
    "capacity" INTEGER,
    "staff" INTEGER,
    "details" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacilityService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StudentSociety" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "departmentId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "advisorId" TEXT,
    "description" TEXT,
    "foundedYear" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentSociety_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SocietyMember" (
    "id" TEXT NOT NULL,
    "societyId" TEXT NOT NULL,
    "studentId" TEXT,
    "name" TEXT NOT NULL,
    "rollNumber" TEXT,
    "position" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocietyMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SocietyEvent" (
    "id" TEXT NOT NULL,
    "societyId" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "venue" TEXT,
    "participants" INTEGER,
    "guests" TEXT,
    "description" TEXT,
    "outcome" TEXT,
    "budget" DOUBLE PRECISION,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocietyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FeeStructure" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "degreeProgram" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "admissionFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tuitionPerSemester" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "perCreditHour" DOUBLE PRECISION,
    "labFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "examFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ScholarshipRecord" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "scheme" TEXT NOT NULL,
    "degreeProgram" TEXT,
    "students" INTEGER NOT NULL DEFAULT 0,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScholarshipRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TopicPrerequisite_chairmanId_idx" ON "TopicPrerequisite"("chairmanId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TopicPrerequisite_coordinatorId_dependentCourseCode_idx" ON "TopicPrerequisite"("coordinatorId", "dependentCourseCode");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TopicPrerequisite_coordinatorId_prereqCourseCode_prereqTopi_key" ON "TopicPrerequisite"("coordinatorId", "prereqCourseCode", "prereqTopic", "dependentCourseCode", "dependentTopic");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TopicFollowUp_chairmanId_status_idx" ON "TopicFollowUp"("chairmanId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TopicFollowUp_coordinatorId_targetCourseCode_idx" ON "TopicFollowUp"("coordinatorId", "targetCourseCode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TopicFollowUp_assignedToId_idx" ON "TopicFollowUp"("assignedToId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TopicFollowUp_sourceCourseId_kind_topic_targetCourseCode_key" ON "TopicFollowUp"("sourceCourseId", "kind", "topic", "targetCourseCode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TopicSuggestion_toCourseId_status_idx" ON "TopicSuggestion"("toCourseId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TopicSuggestion_fromUserId_idx" ON "TopicSuggestion"("fromUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SystemFeedback_userId_idx" ON "SystemFeedback"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SystemFeedback_status_createdAt_idx" ON "SystemFeedback"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FacilityBuilding_chairmanId_name_key" ON "FacilityBuilding"("chairmanId", "name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FacilityRoom_chairmanId_idx" ON "FacilityRoom"("chairmanId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FacilityRoom_buildingId_name_key" ON "FacilityRoom"("buildingId", "name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FacilityService_chairmanId_kind_idx" ON "FacilityService"("chairmanId", "kind");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StudentSociety_advisorId_idx" ON "StudentSociety"("advisorId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "StudentSociety_chairmanId_name_key" ON "StudentSociety"("chairmanId", "name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocietyMember_societyId_idx" ON "SocietyMember"("societyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocietyEvent_societyId_idx" ON "SocietyEvent"("societyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocietyEvent_chairmanId_eventDate_idx" ON "SocietyEvent"("chairmanId", "eventDate");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FeeStructure_chairmanId_degreeProgram_session_key" ON "FeeStructure"("chairmanId", "degreeProgram", "session");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ScholarshipRecord_chairmanId_fiscalYear_idx" ON "ScholarshipRecord"("chairmanId", "fiscalYear");

SELECT 'done' AS result;
