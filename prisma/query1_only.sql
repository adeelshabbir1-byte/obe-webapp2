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
