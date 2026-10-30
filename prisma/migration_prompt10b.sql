-- Prompt 10, build B: teachers' own calendar blocks, appointment settings and requests, linked Google / Outlook
-- calendars (read-only free/busy; the refresh token is stored encrypted), and the Course Catalog — the institute's
-- master copy of courses (Computing, Management Sciences, Engineering), versioned, with imports recorded. Side tables
-- only; safe to run more than once.
CREATE TABLE IF NOT EXISTS "TeacherBlock" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "dayOfWeek" INTEGER, "date" TEXT, "startMin" INTEGER NOT NULL, "endMin" INTEGER NOT NULL,
  "label" TEXT NOT NULL DEFAULT '', "privacy" TEXT NOT NULL DEFAULT 'BUSY', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "TeacherBlock_userId_idx" ON "TeacherBlock"("userId");

CREATE TABLE IF NOT EXISTS "AppointmentSetting" (
  "userId" TEXT PRIMARY KEY, "slotMinutes" INTEGER NOT NULL DEFAULT 30, "maxPerDay" INTEGER NOT NULL DEFAULT 4,
  "startMin" INTEGER NOT NULL DEFAULT 540, "endMin" INTEGER NOT NULL DEFAULT 960, "daysJson" TEXT NOT NULL DEFAULT '[1,2,3,4,5]',
  "classPrivacy" TEXT NOT NULL DEFAULT 'DETAILS', "counsellingPrivacy" TEXT NOT NULL DEFAULT 'BUSY', "open" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "AppointmentRequest" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT, "teacherId" TEXT NOT NULL, "requesterKind" TEXT NOT NULL, "requesterId" TEXT NOT NULL, "requesterName" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL, "reason" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
  "note" TEXT, "decidedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AppointmentRequest_teacher_idx" ON "AppointmentRequest"("teacherId", "startsAt");
CREATE INDEX IF NOT EXISTS "AppointmentRequest_requester_idx" ON "AppointmentRequest"("requesterId");

CREATE TABLE IF NOT EXISTS "CalendarLink" (
  "userId" TEXT NOT NULL, "provider" TEXT NOT NULL, "refreshTokenEnc" TEXT NOT NULL, "account" TEXT,
  "busyJson" TEXT, "busyAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("userId", "provider")
);

CREATE TABLE IF NOT EXISTS "CatalogCourse" (
  "id" TEXT PRIMARY KEY, "field" TEXT NOT NULL, "discipline" TEXT NOT NULL, "code" TEXT NOT NULL, "title" TEXT NOT NULL,
  "level" INTEGER NOT NULL, "area" INTEGER NOT NULL, "serial" INTEGER NOT NULL,
  "creditHours" INTEGER NOT NULL, "theoryCh" INTEGER NOT NULL, "labCh" INTEGER NOT NULL DEFAULT 0,
  "semester" INTEGER, "semesterReason" TEXT, "gaSet" TEXT NOT NULL, "source" TEXT NOT NULL, "sourceNote" TEXT,
  "instituteCodesJson" TEXT NOT NULL DEFAULT '[]', "closJson" TEXT NOT NULL DEFAULT '[]', "lecturesJson" TEXT NOT NULL DEFAULT '[]',
  "prereqCodesJson" TEXT NOT NULL DEFAULT '[]', "topicLinksJson" TEXT NOT NULL DEFAULT '[]', "booksJson" TEXT NOT NULL DEFAULT '[]',
  "version" INTEGER NOT NULL DEFAULT 1, "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CatalogCourse_code_key" ON "CatalogCourse"("code");
CREATE INDEX IF NOT EXISTS "CatalogCourse_field_idx" ON "CatalogCourse"("field", "level");

CREATE TABLE IF NOT EXISTS "CatalogVersion" (
  "id" TEXT PRIMARY KEY, "catalogId" TEXT NOT NULL, "version" INTEGER NOT NULL, "dataJson" TEXT NOT NULL,
  "byUserId" TEXT, "note" TEXT, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CatalogVersion_catalogId_idx" ON "CatalogVersion"("catalogId", "version");

CREATE TABLE IF NOT EXISTS "CatalogImport" (
  "id" TEXT PRIMARY KEY, "courseId" TEXT NOT NULL, "catalogId" TEXT NOT NULL, "catalogCode" TEXT NOT NULL, "version" INTEGER NOT NULL,
  "partsJson" TEXT NOT NULL, "byUserId" TEXT NOT NULL, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CatalogImport_courseId_idx" ON "CatalogImport"("courseId");

CREATE TABLE IF NOT EXISTS "CatalogSetting" (
  "id" TEXT PRIMARY KEY, "stopListJson" TEXT NOT NULL DEFAULT '[]', "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
