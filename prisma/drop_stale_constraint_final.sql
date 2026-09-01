-- Run in Supabase SQL Editor. This is a plain unique INDEX, not a formal
-- table constraint (that's why DROP CONSTRAINT couldn't find it) — drop it
-- as an index instead. The correct one (Course_coordinatorId_batchId_code_key)
-- already exists and stays untouched.

DROP INDEX IF EXISTS "Course_coordinatorId_code_key";

-- Confirm only the correct one remains
SELECT
  i.relname AS index_or_constraint_name,
  array_agg(a.attname ORDER BY a.attnum) AS columns
FROM pg_class t
JOIN pg_index ix ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
WHERE t.relname = 'Course' AND ix.indisunique = true
GROUP BY i.relname
ORDER BY i.relname;
