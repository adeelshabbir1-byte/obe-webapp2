-- Alumni voice: personal alumni corner links, faculty requests to alumni (Alumni Connector badge), alumni suggestions
-- and workshop offers with faculty comments, and alumni made Industry Subject Experts. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "AlumniAccess" (
  "id" TEXT NOT NULL, "alumniId" TEXT NOT NULL, "token" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AlumniAccess_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AlumniAccess_alumniId_key" ON "AlumniAccess"("alumniId");
CREATE UNIQUE INDEX IF NOT EXISTS "AlumniAccess_token_key" ON "AlumniAccess"("token");
CREATE TABLE IF NOT EXISTS "AlumniRequest" (
  "id" TEXT NOT NULL, "alumniId" TEXT NOT NULL, "requestedById" TEXT NOT NULL, "token" TEXT NOT NULL,
  "message" TEXT NOT NULL, "questionsJson" TEXT NOT NULL DEFAULT '[]', "respondedAt" TIMESTAMP(3), "answersJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AlumniRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AlumniRequest_token_key" ON "AlumniRequest"("token");
CREATE INDEX IF NOT EXISTS "AlumniRequest_requestedById_idx" ON "AlumniRequest"("requestedById");
CREATE TABLE IF NOT EXISTS "AlumniVoice" (
  "id" TEXT NOT NULL, "chairmanId" TEXT NOT NULL, "alumniId" TEXT NOT NULL, "kind" TEXT NOT NULL,
  "program" TEXT, "courseCode" TEXT, "title" TEXT NOT NULL, "text" TEXT NOT NULL, "preferredDates" TEXT, "audience" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN', "reply" TEXT, "scheduledFor" TIMESTAMP(3), "decidedById" TEXT, "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AlumniVoice_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AlumniVoice_chairmanId_idx" ON "AlumniVoice"("chairmanId");
CREATE TABLE IF NOT EXISTS "AlumniVoiceComment" (
  "id" TEXT NOT NULL, "voiceId" TEXT NOT NULL, "authorId" TEXT NOT NULL, "authorName" TEXT NOT NULL, "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AlumniVoiceComment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AlumniVoiceComment_voiceId_idx" ON "AlumniVoiceComment"("voiceId");
CREATE TABLE IF NOT EXISTS "IndustryExpert" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "alumniId" TEXT NOT NULL, "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IndustryExpert_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "IndustryExpert_userId_key" ON "IndustryExpert"("userId");
CREATE INDEX IF NOT EXISTS "IndustryExpert_alumniId_idx" ON "IndustryExpert"("alumniId");
