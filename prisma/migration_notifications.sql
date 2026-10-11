-- In-app notifications (the bell in the top bar).
CREATE TABLE IF NOT EXISTS "Notification" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT,
  "href" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
