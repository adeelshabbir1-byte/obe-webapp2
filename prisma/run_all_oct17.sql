-- All database updates up to 17 Oct 2026 in one script (appraisals, leave, recognition, sign-in watch, PLO requests,
-- exam question minimums, Irfan's Oct 15-16 features, outcome weights). Every statement only ADDS what is missing
-- (IF NOT EXISTS), so it is safe to run even if some parts were run before, and safe to run twice.

-- ===== migration_appraisals.sql =====
-- Faculty annual appraisal (system scorecard + reviewer ratings and remarks + the teacher's reply).
CREATE TABLE IF NOT EXISTS "FacultyAppraisal" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "chairmanId" TEXT NOT NULL,
  "reviewerId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "ratingsJson" TEXT NOT NULL DEFAULT '{}',
  "studentFeedback" DOUBLE PRECISION,
  "overall" TEXT,
  "strengths" TEXT,
  "improve" TEXT,
  "goals" TEXT,
  "metricsJson" TEXT,
  "facultyComment" TEXT,
  "acknowledgedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("userId", "year")
);
CREATE INDEX IF NOT EXISTS "FacultyAppraisal_chairmanId_year_idx" ON "FacultyAppraisal"("chairmanId", "year");

-- ===== migration_faculty_leave.sql =====
-- Faculty on semester / study leave, or who left: kept on record, not assignable in the terms covered.
CREATE TABLE IF NOT EXISTS "FacultyLeave" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "chairmanId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "fromTerm" INTEGER NOT NULL,
  "toTerm" INTEGER,
  "allowDesign" BOOLEAN NOT NULL DEFAULT false,
  "note" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "FacultyLeave_chairmanId_idx" ON "FacultyLeave"("chairmanId");
CREATE INDEX IF NOT EXISTS "FacultyLeave_userId_idx" ON "FacultyLeave"("userId");
-- Who taught which lectures when a course changes hands mid-semester.
CREATE TABLE IF NOT EXISTS "CourseHandover" (
  "id" TEXT PRIMARY KEY,
  "courseId" TEXT NOT NULL,
  "fromUserId" TEXT NOT NULL,
  "toUserId" TEXT,
  "lecturesDelivered" INTEGER NOT NULL DEFAULT 0,
  "lastLectureNumber" INTEGER,
  "reason" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CourseHandover_courseId_idx" ON "CourseHandover"("courseId");

-- ===== migration_short_leave.sql =====
-- Short leave (a few days) and how each class in it is covered: substitute teacher, make-up class, or cancelled.
CREATE TABLE IF NOT EXISTS "ShortLeave" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "chairmanId" TEXT NOT NULL,
  "fromDate" TIMESTAMP(3) NOT NULL,
  "toDate" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "approverId" TEXT,
  "decidedAt" TIMESTAMP(3),
  "decisionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ShortLeave_chairmanId_idx" ON "ShortLeave"("chairmanId");
CREATE INDEX IF NOT EXISTS "ShortLeave_userId_idx" ON "ShortLeave"("userId");
CREATE TABLE IF NOT EXISTS "SubstituteClass" (
  "id" TEXT PRIMARY KEY,
  "leaveId" TEXT NOT NULL,
  "chairmanId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "entryId" TEXT NOT NULL,
  "courseCode" TEXT NOT NULL,
  "courseTitle" TEXT NOT NULL,
  "sectionLabel" TEXT NOT NULL,
  "timeLabel" TEXT NOT NULL,
  "roomName" TEXT NOT NULL,
  "originalId" TEXT NOT NULL,
  "plan" TEXT NOT NULL DEFAULT 'SUBSTITUTE',
  "substituteId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'NEEDED',
  "makeupDate" TIMESTAMP(3),
  "topic" TEXT,
  "note" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("leaveId", "entryId", "date")
);
CREATE INDEX IF NOT EXISTS "SubstituteClass_chairmanId_date_idx" ON "SubstituteClass"("chairmanId", "date");
CREATE INDEX IF NOT EXISTS "SubstituteClass_substituteId_idx" ON "SubstituteClass"("substituteId");

-- ===== migration_recognition.sql =====
-- Recognition layer: semester badges for teachers, and department goals everyone can see.
CREATE TABLE IF NOT EXISTS "RecognitionBadge" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "term" TEXT NOT NULL,
  "badgeKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "reason" TEXT,
  "awardedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("userId", "term", "badgeKey", "title")
);
CREATE INDEX IF NOT EXISTS "RecognitionBadge_chairmanId_term_idx" ON "RecognitionBadge"("chairmanId", "term");
CREATE TABLE IF NOT EXISTS "RecognitionGoal" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "departmentId" TEXT,
  "title" TEXT NOT NULL,
  "metric" TEXT NOT NULL,
  "targetPct" INTEGER NOT NULL DEFAULT 100,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "RecognitionGoal_chairmanId_idx" ON "RecognitionGoal"("chairmanId");

-- ===== migration_inactivity.sql =====
-- Sign-in watch: when each person last used the app, each boss's limit (working days), and alerts already sent.
-- New tables only; nothing existing is changed.
CREATE TABLE IF NOT EXISTS "UserActivity" (
  "userId" TEXT PRIMARY KEY,
  "lastSeenAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE IF NOT EXISTS "InactivityPolicy" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "bossId" TEXT NOT NULL,
  "workingDays" INTEGER NOT NULL DEFAULT 3,
  "offDaysJson" TEXT NOT NULL DEFAULT '[0,6]',
  "exemptIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "InactivityPolicy_bossId_key" ON "InactivityPolicy"("bossId");
CREATE INDEX IF NOT EXISTS "InactivityPolicy_chairmanId_idx" ON "InactivityPolicy"("chairmanId");
CREATE TABLE IF NOT EXISTS "InactivityAlert" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "bossId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  "workingDays" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "InactivityAlert_bossId_userId_lastSeenAt_key" ON "InactivityAlert"("bossId", "userId", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "InactivityAlert_userId_idx" ON "InactivityAlert"("userId");

-- ===== migration_plo_requests.sql =====
-- Requests from a Subject Expert or Instructor to add a PLO to their course or take one off; the OMC decides.
-- New table only; nothing existing is changed.
CREATE TABLE IF NOT EXISTS "PloChangeRequest" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "ploId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "requestedAs" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  "decisionNote" TEXT,
  "closUnmapped" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PloChangeRequest_chairmanId_status_idx" ON "PloChangeRequest"("chairmanId", "status");
CREATE INDEX IF NOT EXISTS "PloChangeRequest_courseId_idx" ON "PloChangeRequest"("courseId");

-- ===== migration_exam_question_policy.sql =====
-- The OMC's minimum number of questions in the Midterm and Final papers, per course type. New table only.
CREATE TABLE IF NOT EXISTS "ExamQuestionPolicy" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "courseType" TEXT NOT NULL,
  "midtermMinQuestions" INTEGER NOT NULL DEFAULT 0,
  "finalMinQuestions" INTEGER NOT NULL DEFAULT 0,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ExamQuestionPolicy_chairmanId_courseType_key" ON "ExamQuestionPolicy"("chairmanId", "courseType");

-- ===== migration_oct2026_features.sql =====
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

-- ===== migration_fyp.sql =====
-- ============================================================================
-- Final Year Projects (FYP): FYP Head and Committee, cycles, proposals, groups,
-- applications, milestones, rubric, panels (with external evaluators), scores,
-- results, extensions, requisitions, artifacts.
--
-- Run in Supabase's SQL Editor AFTER migration_oct2026_features.sql. Safe to run
-- more than once; it only adds tables. Generated from prisma/schema.prisma.
-- ============================================================================

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypStaff" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FypStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypCycle" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "termName" TEXT NOT NULL,
    "termYear" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "courseCode" TEXT NOT NULL DEFAULT 'FYP',
    "courseTitle" TEXT NOT NULL DEFAULT 'Final Year Project',
    "creditHours" INTEGER NOT NULL DEFAULT 6,
    "supervisorPct" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "internalPct" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "externalPct" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "minGroupSize" INTEGER NOT NULL DEFAULT 2,
    "maxGroupSize" INTEGER NOT NULL DEFAULT 4,
    "minCgpa" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "minCreditHours" INTEGER NOT NULL DEFAULT 95,
    "maxApplications" INTEGER NOT NULL DEFAULT 3,
    "cutoffsJson" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FypCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypMilestone" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "weightPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FypMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypRubricCriterion" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "bloomLevel" TEXT,
    "ploNumber" INTEGER,
    "maxScore" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "appliesTo" TEXT NOT NULL DEFAULT 'INDIVIDUAL',
    "orderIndex" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FypRubricCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypProposal" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "proposerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "domain" TEXT,
    "abstract" TEXT NOT NULL,
    "scope" TEXT,
    "skills" TEXT,
    "hardware" TEXT,
    "software" TEXT,
    "outcomes" TEXT,
    "ploNumbers" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "maxGroups" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FypProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypGroup" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leaderId" TEXT NOT NULL,
    "proposalId" TEXT,
    "supervisorId" TEXT,
    "panelId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'FORMING',
    "atRisk" BOOLEAN NOT NULL DEFAULT false,
    "riskNote" TEXT,
    "extendedUntil" TIMESTAMP(3),
    "publicationFlag" BOOLEAN NOT NULL DEFAULT false,
    "patentFlag" BOOLEAN NOT NULL DEFAULT false,
    "incubatorFlag" BOOLEAN NOT NULL DEFAULT false,
    "flagNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FypGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypGroupMember" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FypGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypApplication" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FypApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypPanel" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "venue" TEXT,
    "sessionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FypPanel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypPanelMember" (
    "id" TEXT NOT NULL,
    "panelId" TEXT NOT NULL,
    "userId" TEXT,
    "externalId" TEXT,
    "role" TEXT NOT NULL,

    CONSTRAINT "FypPanelMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypExternal" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "organization" TEXT,
    "designation" TEXT,
    "expertise" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FypExternal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypScore" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "evaluatorKey" TEXT NOT NULL,
    "evaluatorRole" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FypScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypEvaluation" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "evaluatorKey" TEXT NOT NULL,
    "evaluatorRole" TEXT NOT NULL,
    "evaluatorName" TEXT NOT NULL,
    "comments" TEXT,
    "recommendation" TEXT NOT NULL DEFAULT 'ON_TRACK',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FypEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypResult" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "totalPct" DOUBLE PRECISION NOT NULL,
    "grade" TEXT NOT NULL,
    "gpaPoints" DOUBLE PRECISION,
    "ploJson" TEXT NOT NULL,
    "breakdownJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONSOLIDATED',
    "note" TEXT,
    "consolidatedById" TEXT NOT NULL,
    "consolidatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "FypResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypExtension" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "previousDue" TIMESTAMP(3),
    "newDueDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "followUpAt" TIMESTAMP(3),
    "grantedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FypExtension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypRequisition" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "details" TEXT,
    "amount" DOUBLE PRECISION,
    "sponsor" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "requestedBy" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FypRequisition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FypArtifact" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "similarityPct" DOUBLE PRECISION,
    "note" TEXT,
    "addedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FypArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypStaff_userId_idx" ON "FypStaff"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FypStaff_departmentId_userId_key" ON "FypStaff"("departmentId", "userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypCycle_departmentId_idx" ON "FypCycle"("departmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypMilestone_cycleId_idx" ON "FypMilestone"("cycleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypRubricCriterion_cycleId_idx" ON "FypRubricCriterion"("cycleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypProposal_cycleId_status_idx" ON "FypProposal"("cycleId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypProposal_proposerId_idx" ON "FypProposal"("proposerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypGroup_cycleId_idx" ON "FypGroup"("cycleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypGroup_supervisorId_idx" ON "FypGroup"("supervisorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypGroup_panelId_idx" ON "FypGroup"("panelId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypGroupMember_groupId_idx" ON "FypGroupMember"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FypGroupMember_cycleId_studentId_key" ON "FypGroupMember"("cycleId", "studentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypApplication_proposalId_status_idx" ON "FypApplication"("proposalId", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FypApplication_groupId_proposalId_key" ON "FypApplication"("groupId", "proposalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypPanel_cycleId_idx" ON "FypPanel"("cycleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypPanelMember_panelId_idx" ON "FypPanelMember"("panelId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypPanelMember_userId_idx" ON "FypPanelMember"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypPanelMember_externalId_idx" ON "FypPanelMember"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FypExternal_tokenHash_key" ON "FypExternal"("tokenHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypExternal_cycleId_idx" ON "FypExternal"("cycleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypScore_groupId_idx" ON "FypScore"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FypScore_milestoneId_criterionId_studentId_evaluatorKey_key" ON "FypScore"("milestoneId", "criterionId", "studentId", "evaluatorKey");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FypEvaluation_groupId_milestoneId_evaluatorKey_key" ON "FypEvaluation"("groupId", "milestoneId", "evaluatorKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypResult_groupId_idx" ON "FypResult"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FypResult_cycleId_studentId_key" ON "FypResult"("cycleId", "studentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypExtension_groupId_idx" ON "FypExtension"("groupId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypRequisition_groupId_idx" ON "FypRequisition"("groupId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FypArtifact_groupId_idx" ON "FypArtifact"("groupId");

-- ===== migration_master_spec.sql =====
-- ============================================================================
-- Prerequisite strengths (Strong / Mild / Weak) and review modules, remediation
-- (tutorials, junior-class sitting, micro-assessment, fees and instructor pay),
-- course tools, the shared textbook pool and library requisitions, society event
-- proposals and co-curricular engagement points, and topic-overlap judgements.
--
-- Run in Supabase's SQL Editor AFTER migration_fyp.sql. Safe to run more than
-- once; it only adds tables and columns (existing topic links become MILD,
-- existing society events stay APPROVED). Generated from prisma/schema.prisma.
-- ============================================================================

-- AlterTable
ALTER TABLE "TopicPrerequisite" ADD COLUMN IF NOT EXISTS "orphanedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "strength" TEXT NOT NULL DEFAULT 'MILD',
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "SocietyEvent" ADD COLUMN IF NOT EXISTS "budgetRequested" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "decidedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "decidedById" TEXT,
ADD COLUMN IF NOT EXISTS "decisionNote" TEXT,
ADD COLUMN IF NOT EXISTS "endTime" TEXT,
ADD COLUMN IF NOT EXISTS "equipment" TEXT,
ADD COLUMN IF NOT EXISTS "proposedByStudentId" TEXT,
ADD COLUMN IF NOT EXISTS "roomId" TEXT,
ADD COLUMN IF NOT EXISTS "startTime" TEXT,
ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'APPROVED';

-- CreateTable
CREATE TABLE IF NOT EXISTS "PrereqReviewPlan" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "lectureNumber" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "note" TEXT,
    "byId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrereqReviewPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RemediationPlan" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "coordinatorId" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "courseTitle" TEXT NOT NULL,
    "topics" TEXT[],
    "cloCodes" TEXT[],
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructorId" TEXT,
    "hostCourseId" TEXT,
    "lectureNumbers" INTEGER[],
    "schedule" TEXT,
    "startDate" TIMESTAMP(3),
    "feePerStudent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "instructorSharePct" DOUBLE PRECISION NOT NULL DEFAULT 70,
    "assessmentTitle" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "payoutAmount" DOUBLE PRECISION,
    "payoutAt" TIMESTAMP(3),
    "payoutById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RemediationPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RemediationEnrollment" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sourceCourseId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ENROLLED',
    "feeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "feeStatus" TEXT NOT NULL DEFAULT 'UNPAID',
    "receiptNo" TEXT,
    "paidAt" TIMESTAMP(3),
    "feeById" TEXT,
    "scorePct" DOUBLE PRECISION,
    "assessedAt" TIMESTAMP(3),
    "assessedById" TEXT,
    "beforeJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RemediationEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CourseTool" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "version" TEXT,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseTool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Textbook" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "authors" TEXT,
    "edition" TEXT,
    "publisher" TEXT,
    "year" INTEGER,
    "isbn" TEXT,
    "normKey" TEXT NOT NULL,
    "subjects" TEXT[],
    "fromHec" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Textbook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CourseTextbook" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "textbookId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'TEXT',
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseTextbook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "LibraryRequisition" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "textbookId" TEXT NOT NULL,
    "inStock" INTEGER NOT NULL DEFAULT 0,
    "ordered" INTEGER NOT NULL DEFAULT 0,
    "received" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryRequisition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "EngagementRecord" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "societyId" TEXT,
    "eventId" TEXT,
    "kind" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "term" TEXT,
    "note" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "awardedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngagementRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TopicOverlapReview" (
    "id" TEXT NOT NULL,
    "coordinatorId" TEXT NOT NULL,
    "codeA" TEXT NOT NULL,
    "codeB" TEXT NOT NULL,
    "topicKey" TEXT NOT NULL,
    "topicA" TEXT NOT NULL,
    "topicB" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "note" TEXT,
    "byId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopicOverlapReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PrereqReviewPlan_courseId_idx" ON "PrereqReviewPlan"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PrereqReviewPlan_linkId_courseId_key" ON "PrereqReviewPlan"("linkId", "courseId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RemediationPlan_chairmanId_status_idx" ON "RemediationPlan"("chairmanId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RemediationPlan_instructorId_idx" ON "RemediationPlan"("instructorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RemediationEnrollment_studentId_idx" ON "RemediationEnrollment"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RemediationEnrollment_planId_studentId_key" ON "RemediationEnrollment"("planId", "studentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CourseTool_courseId_idx" ON "CourseTool"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CourseTool_courseId_name_key" ON "CourseTool"("courseId", "name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Textbook_normKey_key" ON "Textbook"("normKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CourseTextbook_textbookId_idx" ON "CourseTextbook"("textbookId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CourseTextbook_courseId_textbookId_key" ON "CourseTextbook"("courseId", "textbookId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LibraryRequisition_chairmanId_term_textbookId_key" ON "LibraryRequisition"("chairmanId", "term", "textbookId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "EngagementRecord_dedupeKey_key" ON "EngagementRecord"("dedupeKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EngagementRecord_chairmanId_idx" ON "EngagementRecord"("chairmanId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EngagementRecord_studentId_idx" ON "EngagementRecord"("studentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EngagementRecord_eventId_idx" ON "EngagementRecord"("eventId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TopicOverlapReview_coordinatorId_idx" ON "TopicOverlapReview"("coordinatorId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TopicOverlapReview_coordinatorId_codeA_codeB_topicKey_key" ON "TopicOverlapReview"("coordinatorId", "codeA", "codeB", "topicKey");

-- ===== migration_nbeac_sar.sql =====
-- ============================================================================
-- NBEAC Self-Assessment Report (SAR 4.0) data: the institute / business-school
-- profile and the accreditation records register (policies, statutory bodies,
-- audits, admissions figures, counselling, research, MOUs, finance details,
-- confidential cases, ...), plus small additions to existing tables: program
-- level and approvals with the PEO-PLO map, course flags and teaching methods,
-- per-session teaching method and materials, student status, faculty CNIC /
-- specialization / affiliation, publication category and authorship, society
-- kind and membership, employer scope, and the FYP proposal's societal issue.
--
-- Run in Supabase's SQL Editor AFTER migration_master_spec.sql. Safe to run more
-- than once; it only adds tables and columns (every existing student starts as
-- ACTIVE). Generated from prisma/schema.prisma.
-- ============================================================================

-- AlterTable
ALTER TABLE "Employer" ADD COLUMN IF NOT EXISTS "scope" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN IF NOT EXISTS "statusDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "statusReason" TEXT;

-- AlterTable
ALTER TABLE "ProgramProfile" ADD COLUMN IF NOT EXISTS "academicCouncilDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "hecNocDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "launchDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "peoPloJson" TEXT,
ADD COLUMN IF NOT EXISTS "programLevel" TEXT;

-- AlterTable
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "corporateRelevance" TEXT,
ADD COLUMN IF NOT EXISTS "indigenousFocus" TEXT,
ADD COLUMN IF NOT EXISTS "teachingMethods" TEXT;

-- AlterTable
ALTER TABLE "LectureRow" ADD COLUMN IF NOT EXISTS "teachingMaterials" TEXT,
ADD COLUMN IF NOT EXISTS "teachingMethod" TEXT;

-- AlterTable
ALTER TABLE "FacultyProfile" ADD COLUMN IF NOT EXISTS "affiliation" TEXT,
ADD COLUMN IF NOT EXISTS "cnic" TEXT,
ADD COLUMN IF NOT EXISTS "specialization" TEXT;

-- AlterTable
ALTER TABLE "FacultyRecord" ADD COLUMN IF NOT EXISTS "authorship" TEXT,
ADD COLUMN IF NOT EXISTS "category" TEXT,
ADD COLUMN IF NOT EXISTS "citations" INTEGER;

-- AlterTable
ALTER TABLE "StudentSociety" ADD COLUMN IF NOT EXISTS "constitutedOn" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "memberCount" INTEGER,
ADD COLUMN IF NOT EXISTS "societyType" TEXT;

-- AlterTable
ALTER TABLE "FypProposal" ADD COLUMN IF NOT EXISTS "societalIssue" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "SarProfile" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "dataJson" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SarProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AccreditationRecord" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "departmentId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "recordDate" TIMESTAMP(3),
    "year" TEXT,
    "dataJson" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileData" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccreditationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SarProfile_chairmanId_scopeKey_key" ON "SarProfile"("chairmanId", "scopeKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AccreditationRecord_chairmanId_kind_idx" ON "AccreditationRecord"("chairmanId", "kind");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AccreditationRecord_departmentId_idx" ON "AccreditationRecord"("departmentId");

-- ===== migration_help_center.sql =====
-- Help center: the institute's own guides and FAQs, help-desk requests and their replies, "was this helpful" votes,
-- and searches that found nothing. Run in the Supabase SQL editor AFTER migration_nbeac_sar.sql.
-- Safe to run more than once (every statement is IF NOT EXISTS). The built-in manual and FAQ need no tables.
-- Self-service password reset uses the existing "PasswordResetToken" table.

-- CreateTable
CREATE TABLE IF NOT EXISTS "HelpArticle" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT,
    "kind" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "stepsJson" TEXT,
    "whoCan" TEXT,
    "affects" TEXT,
    "roles" TEXT NOT NULL DEFAULT '',
    "pages" TEXT NOT NULL DEFAULT '',
    "keywords" TEXT NOT NULL DEFAULT '',
    "href" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "sourceTicketId" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "HelpTicket" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT,
    "desk" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "query" TEXT,
    "page" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "requesterUserId" TEXT,
    "requesterStudentId" TEXT,
    "requesterName" TEXT NOT NULL,
    "requesterRole" TEXT NOT NULL,
    "recipientIds" TEXT NOT NULL,
    "assignedToId" TEXT,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "HelpTicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "authorStudentId" TEXT,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpTicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "HelpFeedback" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT,
    "articleKey" TEXT NOT NULL,
    "helpful" BOOLEAN NOT NULL,
    "role" TEXT NOT NULL,
    "voterKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "HelpSearchLog" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT,
    "role" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "results" INTEGER NOT NULL,
    "page" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpSearchLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "HelpArticle_chairmanId_idx" ON "HelpArticle"("chairmanId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "HelpTicket_chairmanId_status_idx" ON "HelpTicket"("chairmanId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "HelpTicket_requesterUserId_idx" ON "HelpTicket"("requesterUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "HelpTicket_requesterStudentId_idx" ON "HelpTicket"("requesterStudentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "HelpTicketMessage_ticketId_idx" ON "HelpTicketMessage"("ticketId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "HelpFeedback_chairmanId_idx" ON "HelpFeedback"("chairmanId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "HelpFeedback_articleKey_voterKey_key" ON "HelpFeedback"("articleKey", "voterKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "HelpSearchLog_chairmanId_createdAt_idx" ON "HelpSearchLog"("chairmanId", "createdAt");

-- Self-service password reset links. The table is part of the original schema; created here only if an older
-- database never got it.
CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PasswordResetToken_userId_fkey') THEN
    ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ===== migration_qr_attendance.sql =====
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

-- ===== migration_accreditation_governance.sql =====
-- Accreditation governance: each program bound to its council (NCEAC / NBEAC / HEC), the institute's thresholds per
-- council, accreditation visits with their delegated tasks, task evidence and history, and faculty profile verification.
-- Run in the Supabase SQL editor AFTER migration_qr_attendance.sql. Safe to run more than once.

-- AlterTable
ALTER TABLE "DepartmentProgram" ADD COLUMN IF NOT EXISTS "accreditationBody" TEXT,
ADD COLUMN IF NOT EXISTS "bodySetAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "bodySetById" TEXT;

-- AlterTable
ALTER TABLE "FacultyProfile" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "verifiedById" TEXT,
ADD COLUMN IF NOT EXISTS "verifiedNote" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AccreditationStandard" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "cloPassPct" INTEGER,
    "ploPassPct" INTEGER,
    "ploTargetPct" INTEGER,
    "maxStudentsPerComputer" DOUBLE PRECISION,
    "maxStudentFacultyRatio" INTEGER,
    "minFullTimeFaculty" INTEGER,
    "minPhdFaculty" INTEGER,
    "minCreditHours" INTEGER,
    "maxFacultyLoadCh" INTEGER,
    "maxClassSize" INTEGER,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccreditationStandard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AccreditationCycle" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT NOT NULL,
    "departmentId" TEXT,
    "leadId" TEXT NOT NULL,
    "program" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "visitDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccreditationCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AccreditationTask" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "assigneeId" TEXT,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "accessUntil" TIMESTAMP(3),
    "dataJson" TEXT NOT NULL DEFAULT '{}',
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccreditationTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AccreditationTaskFile" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccreditationTaskFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AccreditationTaskEvent" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "byId" TEXT NOT NULL,
    "toId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccreditationTaskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AccreditationStandard_chairmanId_body_key" ON "AccreditationStandard"("chairmanId", "body");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AccreditationCycle_chairmanId_status_idx" ON "AccreditationCycle"("chairmanId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AccreditationCycle_leadId_idx" ON "AccreditationCycle"("leadId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AccreditationTask_assigneeId_status_idx" ON "AccreditationTask"("assigneeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AccreditationTask_cycleId_code_key" ON "AccreditationTask"("cycleId", "code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AccreditationTaskFile_taskId_idx" ON "AccreditationTaskFile"("taskId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AccreditationTaskEvent_taskId_idx" ON "AccreditationTaskEvent"("taskId");

-- ===== migration_plo_weights.sql =====
-- Outcome weights: how much each course counts toward a PLO of its batch, and how much each PLO counts toward a PEO
-- of its program. New tables only.
CREATE TABLE IF NOT EXISTS "CoursePloWeight" (
  "id" TEXT PRIMARY KEY,
  "batchId" TEXT NOT NULL,
  "ploId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "weightPct" DOUBLE PRECISION NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CoursePloWeight_courseId_ploId_key" ON "CoursePloWeight"("courseId", "ploId");
CREATE INDEX IF NOT EXISTS "CoursePloWeight_batchId_idx" ON "CoursePloWeight"("batchId");
CREATE INDEX IF NOT EXISTS "CoursePloWeight_ploId_idx" ON "CoursePloWeight"("ploId");
CREATE TABLE IF NOT EXISTS "ProgramPeoWeight" (
  "id" TEXT PRIMARY KEY,
  "coordinatorId" TEXT NOT NULL,
  "degreeProgram" TEXT NOT NULL,
  "peoIndex" INTEGER NOT NULL,
  "ploNumber" INTEGER NOT NULL,
  "weightPct" DOUBLE PRECISION NOT NULL,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProgramPeoWeight_coordinatorId_degreeProgram_peoIndex_ploNumber_key" ON "ProgramPeoWeight"("coordinatorId", "degreeProgram", "peoIndex", "ploNumber");
CREATE INDEX IF NOT EXISTS "ProgramPeoWeight_coordinatorId_degreeProgram_idx" ON "ProgramPeoWeight"("coordinatorId", "degreeProgram");

SELECT 'done' AS result;
