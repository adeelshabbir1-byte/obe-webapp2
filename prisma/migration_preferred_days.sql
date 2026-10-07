-- Faculty preferred teaching days (soft preference for the timetable generator)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "preferredDays" TEXT;
