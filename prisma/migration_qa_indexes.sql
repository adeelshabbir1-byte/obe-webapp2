-- QA review: indexes for the busiest lookups. Safe to run more than once.
CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog" ("action", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_actorUserId_createdAt_idx" ON "AuditLog" ("actorUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "StudentMark_instrumentId_idx" ON "StudentMark" ("instrumentId");
CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx" ON "Session" ("expiresAt");
CREATE INDEX IF NOT EXISTS "StudentSession_studentId_idx" ON "StudentSession" ("studentId");
