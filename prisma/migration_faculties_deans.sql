-- Faculties (groups of departments) and Deans.
-- Run the ALTER TYPE line on its own first (Supabase SQL editor: run it, then run the rest).
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'DEAN';
