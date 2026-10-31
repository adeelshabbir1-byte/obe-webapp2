-- "Make demo ready": the institute flagged as a demo (only a flagged institute can be rebuilt, reset, filled with sample
-- marks or signed into with the one-click demo logins), the one course of the current semester left without final-exam
-- marks for the live demo, and whether the one-click demo logins are switched on.
-- Side table only; safe to run more than once.
CREATE TABLE IF NOT EXISTS "DemoFlag" (
  "chairmanId" TEXT PRIMARY KEY, "demoCourseId" TEXT, "loginsOn" BOOLEAN NOT NULL DEFAULT true,
  "readyAt" TIMESTAMP(3), "resetAt" TIMESTAMP(3), "stateJson" TEXT NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
