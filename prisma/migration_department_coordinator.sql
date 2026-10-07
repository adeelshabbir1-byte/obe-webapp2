-- Department-wide Program Coordinator (assistant to the Program Leads)
-- Run the ALTER TYPE line on its own first, then the rest.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'DEPARTMENT_COORDINATOR';
