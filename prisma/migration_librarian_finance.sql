-- Run these two lines on their own, before anything else (like lab_manager).
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'LIBRARIAN';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'FINANCE_OFFICER';
