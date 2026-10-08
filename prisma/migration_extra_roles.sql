-- One person can hold any number of roles (Dean, Chairman, Program Lead, Subject Expert, Instructor ...)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "extraRoles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
