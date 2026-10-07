-- Program Lead: sits under a Head of Department and is responsible for one program.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PROGRAM_LEAD';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "leadProgram" TEXT;
