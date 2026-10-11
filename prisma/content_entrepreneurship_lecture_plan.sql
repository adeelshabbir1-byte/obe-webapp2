-- Entrepreneurship: 32-lecture plan with lecture-to-CLO links, put into the system's HEC curriculum.
-- 1) Every OFFICIAL (shared) curriculum's Entrepreneurship course gets this plan (replacing what it had).
-- 2) Any institute copy whose Entrepreneurship course has NO lecture plan yet gets it too (existing plans are left alone).
-- Each lecture is linked to the course's own CLO that fits it (matched on the CLO wording), so it works whatever the
-- CLO order is in that copy. Run the whole script once; the last query shows what was filled.

DELETE FROM "MasterCourseTopic" t
USING "MasterCourse" mc, "MasterCurriculum" cu
WHERE t."masterCourseId" = mc.id AND cu.id = mc."masterCurriculumId"
  AND cu."chairmanId" IS NULL AND lower(trim(mc.title)) = 'entrepreneurship';

WITH plan(n, topic, subtopic, pats) AS (VALUES
  (1, 'Introduction to Entrepreneurship', 'What entrepreneurship is; entrepreneur, manager and intrapreneur compared', ARRAY['%mindset%','%concept%']),
  (2, 'Introduction to Entrepreneurship', 'Role of entrepreneurship in economic development; the startup ecosystem in Pakistan', ARRAY['%ecosystem%','%mindset%','%concept%']),
  (3, 'The Entrepreneurial Mindset', 'Traits, motivations and common myths about entrepreneurs', ARRAY['%mindset%','%concept%']),
  (4, 'The Entrepreneurial Mindset', 'Creativity, innovation and design thinking', ARRAY['%innovation%','%creativ%','%mindset%','%concept%']),
  (5, 'Types of Ventures', 'Small businesses, scalable startups, technology and social ventures', ARRAY['%mindset%','%concept%']),
  (6, 'Types of Ventures', 'Family businesses, franchising and corporate entrepreneurship', ARRAY['%mindset%','%concept%']),
  (7, 'Opportunity Recognition', 'Sources of ideas: problems, trends, technology and regulation', ARRAY['%opportunit%','%idea%','%market research%']),
  (8, 'Opportunity Recognition', 'Idea generation techniques and first screening of ideas', ARRAY['%opportunit%','%idea%','%market research%']),
  (9, 'Market Research and Customer Discovery', 'Primary and secondary research; customer interviews', ARRAY['%opportunit%','%idea%','%market research%']),
  (10, 'Market Research and Customer Discovery', 'Market sizing: TAM, SAM and SOM', ARRAY['%opportunit%','%idea%','%market research%']),
  (11, 'Industry and Competitor Analysis', 'Porter''s five forces and competitor mapping', ARRAY['%opportunit%','%idea%','%market research%']),
  (12, 'Opportunity Evaluation', 'Validating an opportunity: problem-solution fit and evaluation criteria', ARRAY['%opportunit%','%idea%','%market research%']),
  (13, 'Business Models', 'The Business Model Canvas', ARRAY['%business model%','%business plan%','%plan%','%model%']),
  (14, 'Business Models', 'Value proposition design and revenue models for technology ventures', ARRAY['%business model%','%business plan%','%plan%','%model%']),
  (15, 'Lean Startup', 'Build-measure-learn, minimum viable product and pivots', ARRAY['%business model%','%business plan%','%plan%','%model%']),
  (16, 'Midterm Review', 'Midterm review and opportunity pitch workshop', NULL::text[]),
  (17, 'Marketing for New Ventures', 'Positioning, pricing and go-to-market strategy', ARRAY['%marketing%','%business model%','%business plan%','%plan%','%model%']),
  (18, 'Marketing for New Ventures', 'Low-cost digital marketing and customer acquisition', ARRAY['%marketing%','%business model%','%business plan%','%plan%','%model%']),
  (19, 'Operations and the Founding Team', 'Operations plan, suppliers and building the founding team', ARRAY['%business model%','%business plan%','%plan%','%model%']),
  (20, 'Writing a Business Plan', 'Structure of a business plan and the executive summary', ARRAY['%business model%','%business plan%','%plan%','%model%']),
  (21, 'Financial Planning', 'Start-up costs and break-even analysis', ARRAY['%financial%','%feasib%','%risk%']),
  (22, 'Financial Planning', 'Projected income statement and cash-flow forecast', ARRAY['%financial%','%feasib%','%risk%']),
  (23, 'Financing a Venture', 'Bootstrapping, angel investors, venture capital and bank loans', ARRAY['%funding%','%financ%','%ecosystem%','%resources%','%risk%']),
  (24, 'Financing a Venture', 'Incubators, accelerators and government support schemes in Pakistan', ARRAY['%funding%','%financ%','%ecosystem%','%resources%','%risk%']),
  (25, 'Legal Aspects of a New Venture', 'Forms of business, company registration (SECP) and taxation (FBR)', ARRAY['%risk%','%feasib%']),
  (26, 'Legal Aspects of a New Venture', 'Intellectual property: patents, trademarks and copyright', ARRAY['%risk%','%feasib%']),
  (27, 'Risk and Feasibility', 'Identifying, assessing and managing venture risks', ARRAY['%risk%','%feasib%']),
  (28, 'Risk and Feasibility', 'Feasibility study: market, technical and financial', ARRAY['%feasib%','%risk%']),
  (29, 'Growth, Ethics and Responsibility', 'Scaling a venture, exit options, business ethics and social responsibility', ARRAY['%mindset%','%concept%']),
  (30, 'Pitching a Venture', 'Building a pitch deck and presenting to investors', ARRAY['%business model%','%business plan%','%plan%','%model%']),
  (31, 'Business Plan Presentations', 'Student business plan pitches and feedback', ARRAY['%business model%','%business plan%','%plan%','%model%']),
  (32, 'Course Review', 'Course review and synthesis', NULL::text[])
),
target AS (
  SELECT mc.id FROM "MasterCourse" mc
  WHERE lower(trim(mc.title)) = 'entrepreneurship'
    AND NOT EXISTS (SELECT 1 FROM "MasterCourseTopic" x WHERE x."masterCourseId" = mc.id)
),
clo AS (
  SELECT c."masterCourseId" AS cid, c.statement, row_number() OVER (PARTITION BY c."masterCourseId" ORDER BY c."orderIndex", c.id) AS pos
  FROM "MasterCourseClo" c WHERE c."masterCourseId" IN (SELECT id FROM target)
)
INSERT INTO "MasterCourseTopic" (id, "masterCourseId", "lectureNumber", topic, subtopic, "cloNumber")
SELECT 'ent' || md5(t.id || '-' || p.n), t.id, p.n, p.topic, p.subtopic,
  (SELECT clo.pos FROM unnest(p.pats) WITH ORDINALITY AS pat(pt, pri)
     JOIN clo ON clo.cid = t.id AND clo.statement ILIKE pat.pt
   ORDER BY pat.pri, clo.pos LIMIT 1)
FROM target t CROSS JOIN plan p;

-- Result: one row per curriculum that now has the plan.
SELECT cu.title AS curriculum, cu.version, CASE WHEN cu."chairmanId" IS NULL THEN 'official' ELSE 'institute copy' END AS kind,
  mc.code, count(t.*) AS lectures, count(t."cloNumber") AS linked_to_clo,
  string_agg(DISTINCT 'CLO-' || t."cloNumber", ', ') AS clos_used
FROM "MasterCourse" mc JOIN "MasterCurriculum" cu ON cu.id = mc."masterCurriculumId"
LEFT JOIN "MasterCourseTopic" t ON t."masterCourseId" = mc.id
WHERE lower(trim(mc.title)) = 'entrepreneurship'
GROUP BY cu.title, cu.version, cu."chairmanId", mc.code ORDER BY kind, curriculum;
