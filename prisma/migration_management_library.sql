-- Management-science course library (no CLOs / PLOs), from Prospectus 2024-25.
-- Official (shared) master curricula: codes, titles, credit hours and semester plan only.
-- Safe to re-run: a curriculum that already exists is skipped.

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='BBA' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'BBA', '2024-25', 'Prospectus 2024-25 course list. No CLOs/PLOs (non-outcome-based management programme).', 'PUBLISHED', 'BBA', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1200', 'Functional English', 3, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1100', 'Applications of Information and Communication Technologies', 3, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC1100', 'Principles of Management', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC1500', 'Principles of Marketing', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2603', 'Environmental Sciences', 3, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1201', 'Expository Writing', 3, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2713', 'Psychology', 2, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2800', 'Entrepreneurship', 2, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC1400', 'Principles of Accounting', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2400', 'Islamic Studies', 2, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1300', 'Quantitative Reasoning I', 3, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC2016', 'Business Communication and Report Writing', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC2907', 'Fundamentals of Data Science', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC2401', 'Financial Accounting', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1301', 'Quantitative Reasoning II', 3, 'General Education', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3203', 'Business Economics', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4510', 'Digital Marketing Management', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2401', 'Ideology and Constitution of Pakistan', 2, 'General Education', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC2402', 'Business Finance', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC2901', 'Management Information System', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1504', 'Sociology', 2, 'General Education', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2402', 'Civics and Community Engagement', 2, 'General Education', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3403', 'Management Accounting', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3007', 'Personal and Professional Development', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3103', 'Business and Company Law', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3600', 'Production and Operations Management', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3300', 'Human Resource Management', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4801', 'Critical Thinking and Logic', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3102', 'Organizational Behavior and Professional Ethics', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3008', 'Business Research Methods', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC2401-B', 'Financial Management', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4611', 'Procurement Management', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3700', 'Project Management', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3806', 'Startup Ecosystem & Ideation', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4106', 'Seminar in Business Studies', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4807', 'Innovation and Product Development', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4105', 'International Business', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'INTERN', 'Internship', 3, 'Field Experience', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ELEC-1', 'Elective 1', 3, 'Elective', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ELEC-2', 'Elective 2', 3, 'Elective', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4104', 'Business Policy', 3, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4904', 'Business Analytics', 3, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4114', 'Business Sustainability and Circular Economy', 3, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ELEC-3', 'Elective 3', 3, 'Elective', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ELEC-4', 'Elective 4', 3, 'Elective', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'FYP', 'FYP', 3, 'Capstone Project', NULL, 8, NULL);
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='MBA (for Business Students)' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'MBA (for Business Students)', '2024-25', 'Prospectus 2024-25 course list. No CLOs/PLOs (non-outcome-based management programme).', 'PUBLISHED', 'MBA (for Business Students)', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC5000', 'Research Methodology', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC5400', 'Strategic Finance', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC5500', 'Strategic Marketing', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ELEC-1', 'Elective 1', 3, 'Elective', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC5200', 'Managerial Economics', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC5100', 'Strategic Management', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ELEC-2', 'Elective 2', 3, 'Elective', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ELEC-3', 'Elective 3', 3, 'Elective', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC6002/MSC6003', 'Project PG / Two Electives / MBA Thesis', 6, 'Major', NULL, 3, NULL);
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='MBA (for Non-Business Students)' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'MBA (for Non-Business Students)', '2024-25', 'Prospectus 2024-25 course list. No CLOs/PLOs (non-outcome-based management programme).', 'PUBLISHED', 'MBA (for Non-Business Students)', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4415', 'Accounting for Managers', 3, 'Major', 'Deficiency (for non-business entrants)', 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4500', 'Marketing Theory and Practice', 3, 'Major', 'Deficiency (for non-business entrants)', 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4122', 'Management Theory and Practice', 3, 'Major', 'Deficiency (for non-business entrants)', 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4016', 'Business Communication and Report Writing', 3, 'Major', 'Deficiency (for non-business entrants)', 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC5001', 'Quantitative Techniques', 3, 'Major', 'Deficiency (for non-business entrants)', 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4203', 'Business Economics', 3, 'Major', 'Deficiency (for non-business entrants)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4300', 'Human Resource Management', 3, 'Major', 'Deficiency (for non-business entrants)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4700', 'Project Management', 3, 'Major', 'Deficiency (for non-business entrants)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4901', 'Management Information System', 3, 'Major', 'Deficiency (for non-business entrants)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4416', 'Finance for Managers', 3, 'Major', 'Deficiency (for non-business entrants)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC5200', 'Managerial Economics', 3, 'Major', 'Summer semester', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC5100', 'Strategic Management', 3, 'Major', 'Summer semester', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC5000', 'Research Methodology', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC5400', 'Strategic Finance', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC5500', 'Strategic Marketing', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ELEC-1', 'Elective 1 / Specialization', 3, 'Elective', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ELEC-2', 'Elective 2', 3, 'Elective', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ELEC-3', 'Elective 3', 3, 'Elective', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'THESIS', 'Thesis / Project / Two Elective Courses', 6, 'Capstone Project', NULL, 4, NULL);
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='MS Management Science (for Business Students)' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'MS Management Science (for Business Students)', '2024-25', 'Prospectus 2024-25 course list. No CLOs/PLOs (non-outcome-based management programme).', 'PUBLISHED', 'MS Management Science (for Business Students)', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC6107', 'Advanced Management', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC5000', 'Research Methodology', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ELEC-1', 'Elective 1', 3, 'Elective', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ELEC-2', 'Elective 2', 3, 'Elective', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC6004', 'Quantitative and Qualitative Methods', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ELEC-3', 'Elective 3', 3, 'Elective', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ELEC-4', 'Elective 4', 3, 'Elective', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ELEC-5', 'Elective 5', 3, 'Elective', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'THESIS', 'MS Thesis / Two Elective Courses', 6, 'Capstone Project', NULL, 3, NULL);
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='MS Management Science (for Non-Business Students)' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'MS Management Science (for Non-Business Students)', '2024-25', 'Prospectus 2024-25 course list. No CLOs/PLOs (non-outcome-based management programme).', 'PUBLISHED', 'MS Management Science (for Non-Business Students)', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4415', 'Accounting for Managers', 3, 'Major', 'Deficiency (for non-business entrants)', 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4500', 'Marketing Theory and Practice', 3, 'Major', 'Deficiency (for non-business entrants)', 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4122', 'Management Theory and Practice', 3, 'Major', 'Deficiency (for non-business entrants)', 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4016', 'Business Communication and Report Writing', 3, 'Major', 'Deficiency (for non-business entrants)', 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC5001', 'Quantitative Techniques', 3, 'Major', 'Deficiency (for non-business entrants)', 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4203', 'Business Economics', 3, 'Major', 'Deficiency (for non-business entrants)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4300', 'Human Resource Management', 3, 'Major', 'Deficiency (for non-business entrants)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4700', 'Project Management', 3, 'Major', 'Deficiency (for non-business entrants)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4901', 'Management Information System', 3, 'Major', 'Deficiency (for non-business entrants)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4416', 'Finance for Managers', 3, 'Major', 'Deficiency (for non-business entrants)', 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC6107', 'Advanced Management', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC5000', 'Research Methodology', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ELEC-1', 'Elective 1', 3, 'Elective', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ELEC-2', 'Elective 2', 3, 'Elective', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC5400', 'Strategic Finance', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC5500', 'Strategic Marketing', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ELEC-3', 'Elective 3', 3, 'Elective', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ELEC-4', 'Elective 4', 3, 'Elective', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'THESIS', 'MS Thesis / Two Elective Courses', 6, 'Capstone Project', NULL, 5, NULL);
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='PhD Management Science' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'PhD Management Science', '2024-25', 'Prospectus 2024-25 course list. No CLOs/PLOs (non-outcome-based management programme).', 'PUBLISHED', 'PhD Management Science', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MANDATORY-COURSES', 'Mandatory Courses', 6, 'Major', 'Coursework', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ELEC-1', 'Elective Courses', 12, 'Elective', 'Coursework', NULL, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'THESIS', 'Thesis', 18, 'Capstone Project', 'Research', NULL, 'Complete coursework; pass Qualifying Exam (DQE) & proposal defense; CGPA ≥ 3.5');
  END IF;
END $$;

DO $$
DECLARE cid TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "MasterCurriculum" WHERE authority='Prospectus 2024-25' AND title='BS Accounting & Finance' AND "chairmanId" IS NULL) THEN
    cid := gen_random_uuid()::text;
    INSERT INTO "MasterCurriculum" (id, authority, title, version, "sourceReference", status, "degreeProgram", "createdAt") VALUES (cid, 'Prospectus 2024-25', 'BS Accounting & Finance', '2024-25', 'Prospectus 2024-25 course list. No CLOs/PLOs (non-outcome-based management programme).', 'PUBLISHED', 'BS Accounting & Finance', now());
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1200', 'Functional English', 3, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1100', 'Applications of Information and Communication Technology', 3, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC1100', 'Principles of Management', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC1500', 'Principles of Marketing', 3, 'Major', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2603', 'Environmental Sciences', 3, 'General Education', NULL, 1, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1201', 'Expository Writing', 3, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2713', 'Psychology', 2, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1300', 'Quantitative Reasoning I', 3, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC1400', 'Principles of Accounting', 3, 'Major', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2400', 'Islamic Studies', 2, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2800', 'Entrepreneurship', 2, 'General Education', NULL, 2, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC2016', 'Business Communication and Report Writing', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC2907', 'Fundamentals of Data Science', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC2401', 'Financial Accounting', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1301', 'Quantitative Reasoning II', 3, 'General Education', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC2405', 'Business Taxation', 3, 'Major', NULL, 3, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC2402', 'Business Finance', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2402', 'Ideology and Constitution of Pakistan', 2, 'General Education', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC2213', 'Business Economics', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC2901', 'Management Information System', 3, 'Major', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER1504', 'Sociology', 2, 'General Education', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'GER2402-B', 'Community Service and Social Work', 2, 'General Education', NULL, 4, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3403', 'Management Accounting', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3007', 'Personal and Professional Development', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3103', 'Business and Company Law', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3408', 'Corporate Governance', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3300', 'Human Resource Management', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3801', 'Critical Thinking and Logic', 3, 'Major', NULL, 5, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3410', 'Auditing & Assurance', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3008', 'Business Research Methods', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3404', 'Financial Management', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3442', 'Advanced Management Accounting', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3429', 'Financial Reporting', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC3407', 'Financial Markets and Institutions', 3, 'Major', NULL, 6, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4423', 'Financial Econometrics', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4428', 'Advance Financial Accounting', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4438', 'Financial Risk Management', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ELEC-1', 'Elective 1', 3, 'Elective', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ELEC-2', 'Elective 2', 3, 'Elective', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4006', 'Internship', 3, 'Major', NULL, 7, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4418', 'Financial Modeling', 3, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4416', 'International Finance', 3, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4942', 'Financial Technology', 3, 'Major', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ELEC-3', 'Elective 3', 3, 'Elective', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'ELEC-4', 'Elective 4', 3, 'Elective', NULL, 8, NULL);
    INSERT INTO "MasterCourse" (id, "masterCurriculumId", code, title, "creditHours", category, domain, "semesterNumber", "catalogDescription") VALUES (gen_random_uuid()::text, cid, 'MSC4015', 'FYP', 3, 'Major', NULL, 8, NULL);
  END IF;
END $$;
