-- ============================================================================
-- Performance indexes
-- Run in Supabase's SQL Editor (same as the other migration_*.sql files).
-- Safe to run more than once: every statement is IF [NOT] EXISTS.
--
-- Postgres does NOT index foreign-key columns automatically. Every index below
-- backs either a foreign key that was missing one (joins, and the FK check on
-- every parent-row delete, were full table scans) or a filter the app runs on
-- nearly every page. Names follow Prisma's convention (<Model>_<cols>_idx) so
-- prisma/schema.prisma and the database stay in sync with no drift.
--
-- Tables at institution scale index in milliseconds. If a table is ever very
-- large, run its statement on its own as CREATE INDEX CONCURRENTLY (it cannot
-- run inside the editor's multi-statement transaction).
-- ============================================================================

-- User: "users managed by X with role Y" is the single most frequent query (org chain).
CREATE INDEX IF NOT EXISTS "User_managedById_role_idx" ON "User"("managedById", "role");
DROP INDEX IF EXISTS "User_managedById_idx"; -- superseded by the composite above (same leading column)
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");
CREATE INDEX IF NOT EXISTS "User_customCategoryId_idx" ON "User"("customCategoryId");

-- Course: scoped by Subject Expert / Instructor / reviewer on every faculty page.
CREATE INDEX IF NOT EXISTS "Course_coordinatorId_isOffered_offeredTermName_offeredTermY_idx"
  ON "Course"("coordinatorId", "isOffered", "offeredTermName", "offeredTermYear");
CREATE INDEX IF NOT EXISTS "Course_subjectExpertId_idx" ON "Course"("subjectExpertId");
CREATE INDEX IF NOT EXISTS "Course_instructorId_idx" ON "Course"("instructorId");
CREATE INDEX IF NOT EXISTS "Course_masterCourseId_idx" ON "Course"("masterCourseId");
CREATE INDEX IF NOT EXISTS "Course_benchmarkSourceId_idx" ON "Course"("benchmarkSourceId");
CREATE INDEX IF NOT EXISTS "Course_prerequisiteCourseId_idx" ON "Course"("prerequisiteCourseId");
CREATE INDEX IF NOT EXISTS "Course_assignedOmcReviewerId_idx" ON "Course"("assignedOmcReviewerId");
CREATE INDEX IF NOT EXISTS "Course_customCategoryId_idx" ON "Course"("customCategoryId");

-- Course content: always read as (courseId, source = 'SE' | 'INSTRUCTOR').
CREATE INDEX IF NOT EXISTS "AssessmentInstrument_courseId_source_idx" ON "AssessmentInstrument"("courseId", "source");
DROP INDEX IF EXISTS "AssessmentInstrument_courseId_idx";
CREATE INDEX IF NOT EXISTS "PaperDistributionItem_courseId_source_idx" ON "PaperDistributionItem"("courseId", "source");
DROP INDEX IF EXISTS "PaperDistributionItem_courseId_idx";
CREATE INDEX IF NOT EXISTS "PaperDistributionItem_lectureRowId_idx" ON "PaperDistributionItem"("lectureRowId");
CREATE INDEX IF NOT EXISTS "PaperDistributionItem_cloId_idx" ON "PaperDistributionItem"("cloId");
CREATE INDEX IF NOT EXISTS "LectureRow_cloId_idx" ON "LectureRow"("cloId");
CREATE INDEX IF NOT EXISTS "CLO_mappedPloId_idx" ON "CLO"("mappedPloId");
CREATE INDEX IF NOT EXISTS "StudentMark_instrumentId_idx" ON "StudentMark"("instrumentId");

-- Audit log: newest-first, paginated, per institution.
CREATE INDEX IF NOT EXISTS "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");
DROP INDEX IF EXISTS "AuditLog_actorUserId_idx";
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- Students & registration.
CREATE INDEX IF NOT EXISTS "Batch_advisorId_idx" ON "Batch"("advisorId");
CREATE INDEX IF NOT EXISTS "StudentSession_studentId_idx" ON "StudentSession"("studentId");
CREATE INDEX IF NOT EXISTS "DegreePlanEntry_courseId_idx" ON "DegreePlanEntry"("courseId");
CREATE INDEX IF NOT EXISTS "ElectiveSlotGroup_coordinatorId_idx" ON "ElectiveSlotGroup"("coordinatorId");
CREATE INDEX IF NOT EXISTS "ElectiveChoice_studentId_idx" ON "ElectiveChoice"("studentId");
CREATE INDEX IF NOT EXISTS "OutOfBatchRequest_reviewedById_idx" ON "OutOfBatchRequest"("reviewedById");
CREATE INDEX IF NOT EXISTS "RegistrationApprovalRequest_reviewedById_idx" ON "RegistrationApprovalRequest"("reviewedById");
CREATE INDEX IF NOT EXISTS "AccountRequest_reviewedById_idx" ON "AccountRequest"("reviewedById");

-- Surveys.
CREATE INDEX IF NOT EXISTS "SurveyQuestion_mappedPloId_idx" ON "SurveyQuestion"("mappedPloId");
CREATE INDEX IF NOT EXISTS "SurveyResponse_studentId_idx" ON "SurveyResponse"("studentId");
CREATE INDEX IF NOT EXISTS "SurveyResponse_alumniId_idx" ON "SurveyResponse"("alumniId");
CREATE INDEX IF NOT EXISTS "SurveyResponse_employerId_idx" ON "SurveyResponse"("employerId");
CREATE INDEX IF NOT EXISTS "SurveyAnswer_questionId_idx" ON "SurveyAnswer"("questionId");

-- Refresh planner statistics so the new indexes are used straight away.
ANALYZE "User", "Course", "AssessmentInstrument", "PaperDistributionItem", "LectureRow", "CLO", "StudentMark",
        "AuditLog", "Batch", "StudentSession", "DegreePlanEntry", "ElectiveSlotGroup", "ElectiveChoice",
        "OutOfBatchRequest", "RegistrationApprovalRequest", "AccountRequest",
        "SurveyQuestion", "SurveyResponse", "SurveyAnswer";
