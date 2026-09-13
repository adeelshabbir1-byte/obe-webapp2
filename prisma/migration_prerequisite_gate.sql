-- Run in Supabase SQL Editor. Adds Batch.prerequisitesConfirmedAt — set
-- once the Coordinator confirms they've reviewed/set up that batch's
-- Prerequisite Map. Offer Semester now requires this before offering any
-- of that batch's courses.

ALTER TABLE "Batch" ADD COLUMN IF NOT EXISTS "prerequisitesConfirmedAt" TIMESTAMP(3);
