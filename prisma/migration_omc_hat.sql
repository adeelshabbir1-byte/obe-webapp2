-- Lets a faculty member also be an OMC member (the same login, a role to choose at sign-in).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "omcHat" BOOLEAN NOT NULL DEFAULT false;
