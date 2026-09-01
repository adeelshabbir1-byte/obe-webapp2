-- Run this in Supabase SQL Editor and paste me the full results of BOTH
-- queries below (just copy the output tables shown).

-- Query 1: every unique constraint AND unique index on Course, with their columns
SELECT
  i.relname AS index_or_constraint_name,
  array_agg(a.attname ORDER BY a.attnum) AS columns,
  ix.indisunique AS is_unique
FROM pg_class t
JOIN pg_index ix ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
WHERE t.relname = 'Course'
GROUP BY i.relname, ix.indisunique
ORDER BY i.relname;

-- Query 2: how many Course rows have no batch attached
SELECT count(*) AS orphaned_courses_without_batch
FROM "Course"
WHERE "batchId" IS NULL;
