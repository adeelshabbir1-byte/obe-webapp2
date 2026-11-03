-- Queue item 14: ODL teaching tools (Moodle, Google Classroom + Meet, Microsoft Teams, YouTube) per institute, each
-- course's link to its class in those tools, ODL content modules per lecture topic with the SE / instructional designer
-- sign-off, live sessions with their attendance and recordings, and discussion-board activity. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "TeachingTool" (
  "chairmanId" TEXT NOT NULL, "tool" TEXT NOT NULL, "configJson" TEXT NOT NULL DEFAULT '{}', "secretBox" TEXT,
  "status" TEXT NOT NULL DEFAULT 'NEW', "lastCheckAt" TIMESTAMP(3), "lastError" TEXT, "checkJson" TEXT,
  "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("chairmanId", "tool")
);
CREATE TABLE IF NOT EXISTS "CourseToolLink" (
  "courseId" TEXT NOT NULL, "tool" TEXT NOT NULL, "externalId" TEXT NOT NULL, "extraJson" TEXT NOT NULL DEFAULT '{}',
  "lastSyncAt" TIMESTAMP(3), "lastSyncNote" TEXT,
  PRIMARY KEY ("courseId", "tool")
);
CREATE TABLE IF NOT EXISTS "OdlModule" (
  "id" TEXT PRIMARY KEY, "courseId" TEXT NOT NULL, "lectureNumber" INTEGER NOT NULL, "videoUrl" TEXT, "videoId" TEXT,
  "videoTitle" TEXT, "videoMin" DOUBLE PRECISION, "captions" BOOLEAN NOT NULL DEFAULT false, "selfQ" INTEGER NOT NULL DEFAULT 0,
  "readingUrl" TEXT, "readingMin" INTEGER, "refs" TEXT, "interaction" TEXT, "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "OdlModule_key" ON "OdlModule"("courseId", "lectureNumber");
CREATE TABLE IF NOT EXISTS "OdlContentReview" (
  "courseId" TEXT PRIMARY KEY, "seId" TEXT, "seName" TEXT, "seAt" TIMESTAMP(3), "idId" TEXT, "idName" TEXT, "idAt" TIMESTAMP(3),
  "notes" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "LiveSession" (
  "id" TEXT PRIMARY KEY, "courseId" TEXT NOT NULL, "lectureNumber" INTEGER NOT NULL, "tool" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL, "joinUrl" TEXT, "externalId" TEXT, "organizer" TEXT,
  "recordingUrl" TEXT, "attendees" INTEGER, "attendanceJson" TEXT, "heldMinutes" DOUBLE PRECISION,
  "status" TEXT NOT NULL DEFAULT 'PLANNED', "syncNote" TEXT, "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "syncedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "LiveSession_key" ON "LiveSession"("courseId", "lectureNumber");
CREATE INDEX IF NOT EXISTS "LiveSession_time_idx" ON "LiveSession"("endsAt");
CREATE TABLE IF NOT EXISTS "DiscussionActivity" (
  "courseId" TEXT NOT NULL, "tool" TEXT NOT NULL, "forumId" TEXT NOT NULL, "week" INTEGER NOT NULL, "forumName" TEXT NOT NULL,
  "graded" BOOLEAN NOT NULL DEFAULT false, "posts" INTEGER NOT NULL DEFAULT 0, "teacherPosts" INTEGER NOT NULL DEFAULT 0,
  "students" INTEGER NOT NULL DEFAULT 0, "hours" DOUBLE PRECISION, "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("courseId", "tool", "forumId", "week")
);
