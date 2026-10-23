-- Speed for large institutes (10,000+ students): fast roll-number / name type-ahead and common lookups.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "Student_rollNumber_idx" ON "Student"("rollNumber");
CREATE INDEX IF NOT EXISTS "Student_rollNumber_trgm_idx" ON "Student" USING gin ("rollNumber" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Student_name_trgm_idx" ON "Student" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Student_status_idx" ON "Student"("status");
CREATE INDEX IF NOT EXISTS "Course_batchId_isOffered_idx" ON "Course"("batchId","isOffered");
CREATE INDEX IF NOT EXISTS "StudentTranscriptRecord_studentId_courseCode_idx" ON "StudentTranscriptRecord"("studentId","courseCode");
CREATE INDEX IF NOT EXISTS "StudentEnrollment_courseId_status_idx" ON "StudentEnrollment"("courseId","status");
ANALYZE "Student"; ANALYZE "StudentMark"; ANALYZE "StudentEnrollment"; ANALYZE "AttendanceRecord";
