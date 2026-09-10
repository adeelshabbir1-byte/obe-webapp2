-- Run in Supabase SQL Editor. Adds maxDegreePrograms on User (set on
-- Chairman accounts by the Super User) — the number of distinct Degree
-- Programs that institution is licensed to create. NULL means unlimited.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "maxDegreePrograms" INTEGER;
