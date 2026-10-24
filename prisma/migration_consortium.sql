-- OBEHUB Consortium, phase 1: the Super Admin's rules book (HEC minimums, versioned by effective date), member
-- universities, their NOCs (ODL / joint programme / accreditation, with expiry), exam centres, and one identity per
-- person across the platform (CNIC) with each account's affiliation — employee of an institute, or a sponsored
-- (industry) account a Chairman vouches for. Safe to run more than once.

CREATE TABLE IF NOT EXISTS "ConsortiumRuleSet" (
  "id" TEXT PRIMARY KEY,
  "version" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "rulesJson" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "note" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ConsortiumRuleSet_version_key" ON "ConsortiumRuleSet"("version");

CREATE TABLE IF NOT EXISTS "ConsortiumMember" (
  "chairmanId" TEXT PRIMARY KEY,
  "status" TEXT NOT NULL DEFAULT 'APPLIED',
  "country" TEXT NOT NULL DEFAULT 'PK',
  "city" TEXT,
  "website" TEXT,
  "hecRecognized" BOOLEAN NOT NULL DEFAULT false,
  "residencyJson" TEXT NOT NULL DEFAULT '{}',
  "contactName" TEXT,
  "contactEmail" TEXT,
  "note" TEXT,
  "appliedById" TEXT,
  "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  "decisionNote" TEXT
);
CREATE INDEX IF NOT EXISTS "ConsortiumMember_status_idx" ON "ConsortiumMember"("status");

CREATE TABLE IF NOT EXISTS "ConsortiumNoc" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "programme" TEXT,
  "issuedOn" TIMESTAMP(3),
  "expiresOn" TIMESTAMP(3),
  "note" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ConsortiumNoc_chairmanId_idx" ON "ConsortiumNoc"("chairmanId");

CREATE TABLE IF NOT EXISTS "ExamCentre" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "campusId" TEXT,
  "name" TEXT NOT NULL,
  "city" TEXT,
  "address" TEXT,
  "seats" INTEGER NOT NULL DEFAULT 0,
  "cctv" BOOLEAN NOT NULL DEFAULT false,
  "biometric" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ExamCentre_chairmanId_idx" ON "ExamCentre"("chairmanId");

CREATE TABLE IF NOT EXISTS "ConsortiumPerson" (
  "id" TEXT PRIMARY KEY,
  "cnic" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ConsortiumPerson_cnic_key" ON "ConsortiumPerson"("cnic");

CREATE TABLE IF NOT EXISTS "ConsortiumAffiliation" (
  "userId" TEXT PRIMARY KEY,
  "personId" TEXT NOT NULL,
  "chairmanId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'EMPLOYEE',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "employer" TEXT,
  "designation" TEXT,
  "highestDegree" TEXT,
  "hecAttestationNo" TEXT,
  "reason" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ConsortiumAffiliation_personId_idx" ON "ConsortiumAffiliation"("personId");
CREATE INDEX IF NOT EXISTS "ConsortiumAffiliation_chairmanId_idx" ON "ConsortiumAffiliation"("chairmanId");

-- Phase 2: agreements between member universities, and the course equivalences under them.
-- kind JOINT_DEGREE: a joint programme (both sides approve every equivalence; the matrix goes to HEC for the NOC).
-- kind CREDIT_RECOGNITION: one university recognises another's courses for its own students (only it approves).
CREATE TABLE IF NOT EXISTS "ConsortiumAgreement" (
  "id" TEXT PRIMARY KEY,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "programme" TEXT,
  "edition" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PROPOSED',
  "mouStart" TIMESTAMP(3),
  "mouEnd" TIMESTAMP(3),
  "rulesVersion" INTEGER,
  "gradeMapJson" TEXT NOT NULL DEFAULT '{}',
  "note" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "ConsortiumAgreementParty" (
  "agreementId" TEXT NOT NULL,
  "chairmanId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'PARTNER',
  "curriculumId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'INVITED',
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  PRIMARY KEY ("agreementId", "chairmanId")
);
CREATE INDEX IF NOT EXISTS "ConsortiumAgreementParty_chairmanId_idx" ON "ConsortiumAgreementParty"("chairmanId");
CREATE TABLE IF NOT EXISTS "ConsortiumEquivalence" (
  "id" TEXT PRIMARY KEY,
  "agreementId" TEXT NOT NULL,
  "courseA" TEXT NOT NULL,
  "courseB" TEXT NOT NULL,
  "chairmanA" TEXT NOT NULL,
  "chairmanB" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PROPOSED',
  "evidenceJson" TEXT NOT NULL DEFAULT '{}',
  "approvalsJson" TEXT NOT NULL DEFAULT '{}',
  "note" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ConsortiumEquivalence_pair_key" ON "ConsortiumEquivalence"("agreementId", "courseA", "courseB");
CREATE INDEX IF NOT EXISTS "ConsortiumEquivalence_courseB_idx" ON "ConsortiumEquivalence"("courseB");
CREATE INDEX IF NOT EXISTS "ConsortiumEquivalence_courseA_idx" ON "ConsortiumEquivalence"("courseA");

-- Phase 3: courses a member university opens to students of other member universities (public catalog).
-- mode ON_CAMPUS (visiting seat) | LIVE_ONLINE | SELF_PACED | BLENDED (the last three are ODL).
CREATE TABLE IF NOT EXISTS "ConsortiumOffering" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "term" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "seats" INTEGER NOT NULL DEFAULT 0,
  "feePerCredit" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'PKR',
  "campusId" TEXT,
  "schedule" TEXT,
  "labArrangement" TEXT,
  "deadline" TIMESTAMP(3),
  "startsOn" TIMESTAMP(3),
  "centresJson" TEXT NOT NULL DEFAULT '[]',
  "about" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ConsortiumOffering_status_idx" ON "ConsortiumOffering"("status");
CREATE INDEX IF NOT EXISTS "ConsortiumOffering_chairmanId_idx" ON "ConsortiumOffering"("chairmanId");
CREATE UNIQUE INDEX IF NOT EXISTS "ConsortiumOffering_course_term_key" ON "ConsortiumOffering"("courseId", "term");

-- Phase 4: a student of one member university applies for another's course. The host accepts and enrols them (as a
-- visiting student in its own course, so attendance, marks and CLO attainment work as for its own students); the
-- student's own university decides whether the course counts toward their degree (Subject Expert + Chairman).
CREATE TABLE IF NOT EXISTS "ConsortiumApplication" (
  "id" TEXT PRIMARY KEY,
  "offeringId" TEXT NOT NULL,
  "hostChairmanId" TEXT NOT NULL,
  "homeChairmanId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'APPLIED',
  "statement" TEXT,
  "hostNote" TEXT,
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  "wantsCredit" BOOLEAN NOT NULL DEFAULT true,
  "creditStatus" TEXT NOT NULL DEFAULT 'NOT_REQUESTED',
  "creditAsCourseId" TEXT,
  "creditApprovalsJson" TEXT NOT NULL DEFAULT '{}',
  "creditNote" TEXT,
  "examCentreId" TEXT,
  "fee" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'PKR',
  "paymentRef" TEXT,
  "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
  "paymentVerifiedById" TEXT,
  "paymentVerifiedAt" TIMESTAMP(3),
  "hostStudentId" TEXT,
  "hostLogin" TEXT,
  "tempSecret" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ConsortiumApplication_offering_student_key" ON "ConsortiumApplication"("offeringId", "studentId");
CREATE INDEX IF NOT EXISTS "ConsortiumApplication_host_idx" ON "ConsortiumApplication"("hostChairmanId");
CREATE INDEX IF NOT EXISTS "ConsortiumApplication_home_idx" ON "ConsortiumApplication"("homeChairmanId");
CREATE INDEX IF NOT EXISTS "ConsortiumApplication_student_idx" ON "ConsortiumApplication"("studentId");

-- Phase 5: teaching vacancies for visiting faculty. A member posts a course it has no teacher for; registered faculty
-- of other member universities apply; the host shortlists on platform-verified records and offers the course.
CREATE TABLE IF NOT EXISTS "ConsortiumVacancy" (
  "id" TEXT PRIMARY KEY,
  "chairmanId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "term" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'ON_CAMPUS',
  "schedule" TEXT,
  "pay" INTEGER,
  "payBasis" TEXT,
  "showPay" BOOLEAN NOT NULL DEFAULT true,
  "requirements" TEXT,
  "deadline" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "filledByUserId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ConsortiumVacancy_status_idx" ON "ConsortiumVacancy"("status");
CREATE INDEX IF NOT EXISTS "ConsortiumVacancy_chairmanId_idx" ON "ConsortiumVacancy"("chairmanId");
CREATE TABLE IF NOT EXISTS "ConsortiumVacancyApplication" (
  "id" TEXT PRIMARY KEY,
  "vacancyId" TEXT NOT NULL,
  "applicantId" TEXT NOT NULL,
  "homeChairmanId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'APPLIED',
  "coverNote" TEXT,
  "shareJson" TEXT NOT NULL DEFAULT '{}',
  "nocStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  "nocById" TEXT,
  "nocAt" TIMESTAMP(3),
  "nocNote" TEXT,
  "hostNote" TEXT,
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ConsortiumVacancyApplication_key" ON "ConsortiumVacancyApplication"("vacancyId", "applicantId");
CREATE INDEX IF NOT EXISTS "ConsortiumVacancyApplication_applicant_idx" ON "ConsortiumVacancyApplication"("applicantId");
CREATE INDEX IF NOT EXISTS "ConsortiumVacancyApplication_home_idx" ON "ConsortiumVacancyApplication"("homeChairmanId");

-- Phase 6: the exam-centre network. A university approves which centres (its own and other members') its students may
-- sit consortium exams at; the host lists the centres it accepts on each course. A student's seat is booked at a
-- centre both approve; the centre records attendance (biometric / ID), the invigilator and the recording.
CREATE TABLE IF NOT EXISTS "ConsortiumCentreApproval" (
  "chairmanId" TEXT NOT NULL,
  "centreId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'APPROVED',
  "byId" TEXT NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  PRIMARY KEY ("chairmanId", "centreId")
);
CREATE TABLE IF NOT EXISTS "ConsortiumExamBooking" (
  "applicationId" TEXT PRIMARY KEY,
  "centreId" TEXT NOT NULL,
  "examOn" TIMESTAMP(3),
  "seatNo" TEXT,
  "status" TEXT NOT NULL DEFAULT 'BOOKED',
  "method" TEXT,
  "invigilator" TEXT,
  "recordingRef" TEXT,
  "markedById" TEXT,
  "markedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ConsortiumExamBooking_centreId_idx" ON "ConsortiumExamBooking"("centreId");

-- Phase 7: a visiting student's result, copied from the host's transcript to their own university's transcript
-- (the host's letter grade, with grade points converted under the agreement's grade map).
CREATE TABLE IF NOT EXISTS "ConsortiumTransfer" (
  "applicationId" TEXT PRIMARY KEY,
  "hostRecordId" TEXT NOT NULL,
  "homeRecordId" TEXT NOT NULL,
  "hostGrade" TEXT NOT NULL,
  "hostPoints" DOUBLE PRECISION,
  "homePoints" DOUBLE PRECISION,
  "basis" TEXT NOT NULL,
  "byId" TEXT NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Phase 8: joint degree programmes — each university's share, launch, the lead's batches that study the joint
-- programme, a student's plan of where to take each course, and joint graduation.
ALTER TABLE "ConsortiumAgreement" ADD COLUMN IF NOT EXISTS "sharesJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "ConsortiumAgreement" ADD COLUMN IF NOT EXISTS "launchedAt" TIMESTAMP(3);
CREATE TABLE IF NOT EXISTS "ConsortiumJointBatch" (
  "batchId" TEXT PRIMARY KEY,
  "agreementId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ConsortiumJointBatch_agreementId_idx" ON "ConsortiumJointBatch"("agreementId");
CREATE TABLE IF NOT EXISTS "ConsortiumPlanChoice" (
  "studentId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "chairmanId" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("studentId", "courseId")
);
CREATE TABLE IF NOT EXISTS "ConsortiumGraduation" (
  "id" TEXT PRIMARY KEY,
  "studentId" TEXT NOT NULL,
  "agreementId" TEXT NOT NULL,
  "auditJson" TEXT NOT NULL DEFAULT '{}',
  "approvalsJson" TEXT NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'AUDITED',
  "serial" TEXT,
  "issuedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ConsortiumGraduation_student_key" ON "ConsortiumGraduation"("studentId", "agreementId");
