-- Lab Manager role. Run this line on its own, first, then run migration_lab_finance_activities.sql.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'LAB_MANAGER';
