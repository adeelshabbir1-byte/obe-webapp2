-- Deadlines belong to a role / task, whoever holds it (a named person is now optional)
ALTER TABLE "Deadline" ALTER COLUMN "assigneeId" DROP NOT NULL;
ALTER TABLE "Deadline" ADD COLUMN IF NOT EXISTS "role" TEXT;
