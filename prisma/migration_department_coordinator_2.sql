-- Part 2: run after migration_department_coordinator.sql
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "actingForId" TEXT;
