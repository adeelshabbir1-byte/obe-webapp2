CREATE TABLE IF NOT EXISTS "TaskRequest" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "fromId" TEXT NOT NULL, "toId" TEXT NOT NULL, "leadId" TEXT,
  "subject" TEXT NOT NULL, "area" TEXT, "href" TEXT, "body" TEXT NOT NULL, "dueDate" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'OPEN', "response" TEXT, "respondedAt" TIMESTAMP(3), "doneAt" TIMESTAMP(3), "remindedAt" TIMESTAMP(3),
  "reminders" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "TaskRequest_toId_status_idx" ON "TaskRequest"("toId","status");
CREATE INDEX IF NOT EXISTS "TaskRequest_fromId_status_idx" ON "TaskRequest"("fromId","status");
CREATE INDEX IF NOT EXISTS "TaskRequest_chairmanId_idx" ON "TaskRequest"("chairmanId");
