-- Run in Supabase SQL Editor. Deletes the 44 orphaned Course rows (no batch
-- attached) left over from an earlier failed import, along with anything
-- that might reference them (safe even if those are empty, which they
-- should be since no Subject Expert work was done on them).

DELETE FROM "LectureRowInstrument" WHERE "lectureRowId" IN (SELECT id FROM "LectureRow" WHERE "courseId" IN (SELECT id FROM "Course" WHERE "batchId" IS NULL));
DELETE FROM "LectureRow" WHERE "courseId" IN (SELECT id FROM "Course" WHERE "batchId" IS NULL);
DELETE FROM "CLO" WHERE "courseId" IN (SELECT id FROM "Course" WHERE "batchId" IS NULL);
DELETE FROM "CoursePloMapping" WHERE "courseId" IN (SELECT id FROM "Course" WHERE "batchId" IS NULL);
DELETE FROM "AssessmentInstrument" WHERE "courseId" IN (SELECT id FROM "Course" WHERE "batchId" IS NULL);
DELETE FROM "WeightExceptionRequest" WHERE "courseId" IN (SELECT id FROM "Course" WHERE "batchId" IS NULL);
DELETE FROM "CourseSectionAssignment" WHERE "courseId" IN (SELECT id FROM "Course" WHERE "batchId" IS NULL);
DELETE FROM "CourseEquivalenceMember" WHERE "courseId" IN (SELECT id FROM "Course" WHERE "batchId" IS NULL);

DELETE FROM "Course" WHERE "batchId" IS NULL;

-- Confirm they're gone
SELECT count(*) AS remaining_orphaned_courses FROM "Course" WHERE "batchId" IS NULL;
