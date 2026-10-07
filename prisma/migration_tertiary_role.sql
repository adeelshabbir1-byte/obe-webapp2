-- A third role ("hat") for people who lead, teach and are Subject Experts
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tertiaryRole" TEXT;
