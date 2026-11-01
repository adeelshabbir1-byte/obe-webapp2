-- Adeel prompt part 7: web push subscriptions, mid-semester feedback (anonymous answers + who has answered), committee
-- action items. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "PushSubscription" (
  "id" TEXT PRIMARY KEY, "userId" TEXT, "studentId" TEXT, "endpoint" TEXT NOT NULL, "p256dh" TEXT NOT NULL, "auth" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE TABLE IF NOT EXISTS "MidFeedback" (
  "id" TEXT PRIMARY KEY, "courseId" TEXT NOT NULL, "pace" TEXT NOT NULL, "clarity" INTEGER NOT NULL, "hardestTopic" TEXT,
  "comment" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "MidFeedback_course_idx" ON "MidFeedback"("courseId");
CREATE TABLE IF NOT EXISTS "MidFeedbackDone" (
  "courseId" TEXT NOT NULL, "studentId" TEXT NOT NULL, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY ("courseId", "studentId")
);
CREATE TABLE IF NOT EXISTS "CmtAction" (
  "id" TEXT PRIMARY KEY, "committeeId" TEXT NOT NULL, "meetingId" TEXT, "title" TEXT NOT NULL, "ownerId" TEXT, "due" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'OPEN', "note" TEXT, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "doneAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "CmtAction_committee_idx" ON "CmtAction"("committeeId");
CREATE INDEX IF NOT EXISTS "CmtAction_owner_idx" ON "CmtAction"("ownerId");
