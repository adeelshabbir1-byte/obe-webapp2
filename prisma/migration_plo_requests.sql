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
SELECT 'done' AS result;
