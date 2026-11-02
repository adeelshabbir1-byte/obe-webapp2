-- Queue item 8: classroom observations, students' CLO self-assessment, learning resources per lecture topic, and the
-- HEC national view's private links. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "ClassObservation" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "courseId" TEXT NOT NULL, "teacherId" TEXT NOT NULL, "observerId" TEXT NOT NULL,
  "lectureNumber" INTEGER, "observedOn" TIMESTAMP(3) NOT NULL, "plannedTopic" TEXT, "taughtTopic" TEXT, "scoresJson" TEXT NOT NULL DEFAULT '{}',
  "strengths" TEXT, "improve" TEXT, "status" TEXT NOT NULL DEFAULT 'SHARED', "teacherReply" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ClassObservation_teacher_idx" ON "ClassObservation"("teacherId");
CREATE INDEX IF NOT EXISTS "ClassObservation_chairman_idx" ON "ClassObservation"("chairmanId");
CREATE TABLE IF NOT EXISTS "CloSelfRating" (
  "id" TEXT PRIMARY KEY, "studentId" TEXT NOT NULL, "courseId" TEXT NOT NULL, "cloCode" TEXT NOT NULL, "rating" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CloSelfRating_key" ON "CloSelfRating"("studentId", "courseId", "cloCode");
CREATE INDEX IF NOT EXISTS "CloSelfRating_course_idx" ON "CloSelfRating"("courseId");
CREATE TABLE IF NOT EXISTS "TopicResource" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "courseCode" TEXT NOT NULL, "lectureNumber" INTEGER NOT NULL, "title" TEXT NOT NULL,
  "url" TEXT, "kind" TEXT NOT NULL DEFAULT 'LINK', "note" TEXT, "addedById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "TopicResource_course_idx" ON "TopicResource"("chairmanId", "courseCode");
CREATE TABLE IF NOT EXISTS "HecViewLink" (
  "id" TEXT PRIMARY KEY, "label" TEXT NOT NULL, "tokenHash" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3),
  "lastSeen" TIMESTAMP(3), "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "HecViewLink_token_key" ON "HecViewLink"("tokenHash");
