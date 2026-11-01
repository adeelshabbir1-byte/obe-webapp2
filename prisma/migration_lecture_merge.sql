-- Merging and splitting lectures (Topic Workspace and the Lecture Content tab): each merge or split remembers where it
-- came from — the lectures as they were (topic, CLO, weight, teaching notes, linked assessments and exam questions,
-- importance) — so Unmerge can restore them, and so every view shows it as one merge or split, never as removed + added.
-- Side table only; safe to run more than once.
CREATE TABLE IF NOT EXISTS "LectureMerge" (
  "id" TEXT PRIMARY KEY, "courseId" TEXT NOT NULL, "source" TEXT NOT NULL, "kind" TEXT NOT NULL DEFAULT 'MERGE',
  "intoRowId" TEXT NOT NULL, "freeRowIdsJson" TEXT NOT NULL DEFAULT '[]', "partsJson" TEXT NOT NULL DEFAULT '[]',
  "resultJson" TEXT NOT NULL DEFAULT '{}', "byUserId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "undoneAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "LectureMerge_course_idx" ON "LectureMerge"("courseId", "source");
