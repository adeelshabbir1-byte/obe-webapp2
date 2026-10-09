ALTER TABLE "Deadline" ADD COLUMN IF NOT EXISTS "parentId" TEXT;
ALTER TABLE "Deadline" ADD COLUMN IF NOT EXISTS "planTerm" TEXT;
CREATE INDEX IF NOT EXISTS "Deadline_planTerm_idx" ON "Deadline"("planTerm");
