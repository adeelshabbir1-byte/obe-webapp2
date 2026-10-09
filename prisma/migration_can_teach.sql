-- Outside Subject Experts (industry / other institute) design courses but never teach
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "canTeach" BOOLEAN NOT NULL DEFAULT true;
