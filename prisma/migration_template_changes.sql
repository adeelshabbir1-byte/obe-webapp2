-- Change requests for already-approved course templates, with a record of what changed. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "TemplateChangeRequest" (
  "id" TEXT PRIMARY KEY,
  "courseId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "omcComment" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "termLabel" TEXT,
  "beforeJson" TEXT,
  "changesJson" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "TemplateChangeRequest_courseId_idx" ON "TemplateChangeRequest"("courseId");
CREATE INDEX IF NOT EXISTS "TemplateChangeRequest_status_idx" ON "TemplateChangeRequest"("status");
