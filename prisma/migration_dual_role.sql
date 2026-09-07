-- Run in Supabase SQL Editor. Adds dual-role capability: a Subject Expert
-- can also be assigned/act as an Instructor on the same account.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "secondaryRole" TEXT;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "activeRole" TEXT;
