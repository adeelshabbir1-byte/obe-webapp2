-- ============================================================================
-- Performance indexes (foreign keys)
-- Run in Supabase's SQL Editor (same as the other migration_*.sql files).
-- Safe to run more than once: every statement is IF NOT EXISTS, and nothing is dropped.
--
-- Postgres does NOT index foreign-key columns automatically. Each index below
-- backs a foreign key that had none, so "rows belonging to X" lookups, joins,
-- and the FK check Postgres runs on every parent-row delete were full table
-- scans. Names follow Prisma's convention (<Model>_<column>_idx) and every one
-- has a matching @@index in prisma/schema.prisma, so there is no drift.
--
-- Tables at institution scale index in milliseconds. If a table is ever very
-- large, run its statement on its own as CREATE INDEX CONCURRENTLY (it cannot
-- run inside the editor's multi-statement transaction).
-- ============================================================================


-- User: department / faculty rosters (Dean, HOD and Institute Head pages) and custom-category lookups.
CREATE INDEX IF NOT EXISTS "User_customCategoryId_idx" ON "User"("customCategoryId");
CREATE INDEX IF NOT EXISTS "User_departmentId_idx" ON "User"("departmentId");
CREATE INDEX IF NOT EXISTS "User_facultyId_idx" ON "User"("facultyId");

-- Batch: batches advised by a faculty member.
CREATE INDEX IF NOT EXISTS "Batch_advisorId_idx" ON "Batch"("advisorId");

-- Room: rooms of a department (timetable).
CREATE INDEX IF NOT EXISTS "Room_departmentId_idx" ON "Room"("departmentId");

-- Surveys: answers per question, responses per student / alumnus / employer, questions per PLO.
CREATE INDEX IF NOT EXISTS "SurveyQuestion_mappedPloId_idx" ON "SurveyQuestion"("mappedPloId");
CREATE INDEX IF NOT EXISTS "SurveyResponse_studentId_idx" ON "SurveyResponse"("studentId");
CREATE INDEX IF NOT EXISTS "SurveyResponse_alumniId_idx" ON "SurveyResponse"("alumniId");
CREATE INDEX IF NOT EXISTS "SurveyResponse_employerId_idx" ON "SurveyResponse"("employerId");
CREATE INDEX IF NOT EXISTS "SurveyAnswer_questionId_idx" ON "SurveyAnswer"("questionId");

-- Student registration: requests by reviewer, degree-plan rows per course, elective choices per student.
CREATE INDEX IF NOT EXISTS "OutOfBatchRequest_reviewedById_idx" ON "OutOfBatchRequest"("reviewedById");
CREATE INDEX IF NOT EXISTS "DegreePlanEntry_courseId_idx" ON "DegreePlanEntry"("courseId");
CREATE INDEX IF NOT EXISTS "RegistrationApprovalRequest_reviewedById_idx" ON "RegistrationApprovalRequest"("reviewedById");
CREATE INDEX IF NOT EXISTS "ElectiveSlotGroup_coordinatorId_idx" ON "ElectiveSlotGroup"("coordinatorId");
CREATE INDEX IF NOT EXISTS "ElectiveChoice_studentId_idx" ON "ElectiveChoice"("studentId");

-- Course: "my courses" for a Subject Expert, Instructor, Lab Engineer and OMC reviewer runs on every faculty page; the rest back joins and parent-row deletes.
CREATE INDEX IF NOT EXISTS "Course_subjectExpertId_idx" ON "Course"("subjectExpertId");
CREATE INDEX IF NOT EXISTS "Course_instructorId_idx" ON "Course"("instructorId");
CREATE INDEX IF NOT EXISTS "Course_subjectHomeDepartmentId_idx" ON "Course"("subjectHomeDepartmentId");
CREATE INDEX IF NOT EXISTS "Course_masterCourseId_idx" ON "Course"("masterCourseId");
CREATE INDEX IF NOT EXISTS "Course_benchmarkSourceId_idx" ON "Course"("benchmarkSourceId");
CREATE INDEX IF NOT EXISTS "Course_prerequisiteCourseId_idx" ON "Course"("prerequisiteCourseId");
CREATE INDEX IF NOT EXISTS "Course_assignedOmcReviewerId_idx" ON "Course"("assignedOmcReviewerId");
CREATE INDEX IF NOT EXISTS "Course_customCategoryId_idx" ON "Course"("customCategoryId");
CREATE INDEX IF NOT EXISTS "Course_labEngineerId_idx" ON "Course"("labEngineerId");

-- Course content: CLOs per PLO (attainment reports), paper items and lecture rows per CLO.
CREATE INDEX IF NOT EXISTS "CLO_mappedPloId_idx" ON "CLO"("mappedPloId");
CREATE INDEX IF NOT EXISTS "PaperDistributionItem_lectureRowId_idx" ON "PaperDistributionItem"("lectureRowId");
CREATE INDEX IF NOT EXISTS "PaperDistributionItem_cloId_idx" ON "PaperDistributionItem"("cloId");
CREATE INDEX IF NOT EXISTS "LectureRow_cloId_idx" ON "LectureRow"("cloId");

-- Requests and org structure.
CREATE INDEX IF NOT EXISTS "AccountRequest_reviewedById_idx" ON "AccountRequest"("reviewedById");
CREATE INDEX IF NOT EXISTS "Department_facultyId_idx" ON "Department"("facultyId");
CREATE INDEX IF NOT EXISTS "MasterCourse_designerId_idx" ON "MasterCourse"("designerId");
CREATE INDEX IF NOT EXISTS "TeacherLoanRequest_instructorId_idx" ON "TeacherLoanRequest"("instructorId");
CREATE INDEX IF NOT EXISTS "TeacherLoanRequest_requestingDepartmentId_idx" ON "TeacherLoanRequest"("requestingDepartmentId");

-- Lab marks per student.
CREATE INDEX IF NOT EXISTS "LabMark_studentId_idx" ON "LabMark"("studentId");

-- Safety net: an earlier draft of this file (redesign branches before this one) replaced
-- these four single-column indexes with composites. The schema expects them, so put them
-- back if that draft was ever run. No-ops on a database that never ran it.
CREATE INDEX IF NOT EXISTS "User_managedById_idx" ON "User"("managedById");
CREATE INDEX IF NOT EXISTS "AssessmentInstrument_courseId_idx" ON "AssessmentInstrument"("courseId");
CREATE INDEX IF NOT EXISTS "PaperDistributionItem_courseId_idx" ON "PaperDistributionItem"("courseId");
CREATE INDEX IF NOT EXISTS "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");

ANALYZE;
