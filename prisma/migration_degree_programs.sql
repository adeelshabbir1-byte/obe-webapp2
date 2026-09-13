-- Run in Supabase SQL Editor. Adds DegreeProgram — set up once per
-- Coordinator (name, short code, default intake size, which terms it's
-- usually offered in), then reused every semester to bulk-create that
-- term's intake batches via checkboxes instead of retyping names.

CREATE TABLE IF NOT EXISTS "DegreeProgram" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "coordinatorId" TEXT NOT NULL REFERENCES "User"("id"),
  "name" TEXT NOT NULL,
  "shortCode" TEXT NOT NULL,
  "defaultIntakeSize" INTEGER NOT NULL DEFAULT 30,
  "usuallyOfferedInFall" BOOLEAN NOT NULL DEFAULT true,
  "usuallyOfferedInSpring" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "DegreeProgram_coordinatorId_shortCode_key" ON "DegreeProgram"("coordinatorId", "shortCode");
CREATE INDEX IF NOT EXISTS "DegreeProgram_coordinatorId_idx" ON "DegreeProgram"("coordinatorId");
