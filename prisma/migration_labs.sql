-- Labs: Lab Engineer role, lab manuals (Word files, versioned) and lab marks
-- Run the ALTER TYPE line on its own first, then the rest (migration_labs_2.sql).
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'LAB_ENGINEER';
