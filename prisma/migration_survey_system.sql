-- Run in Supabase SQL Editor. Adds the full stakeholder feedback survey
-- system: Alumni and Employer contact records, survey templates with
-- PLO-mapped questions, and token-based (no-login) response collection —
-- used to compute indirect PLO attainment alongside direct attainment.

CREATE TABLE IF NOT EXISTS "Alumni" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "coordinatorId" TEXT NOT NULL REFERENCES "User"("id"),
  "name" TEXT NOT NULL,
  "email" TEXT,
  "degreeProgram" TEXT NOT NULL,
  "graduationYear" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Alumni' AND column_name = 'coordinatorId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS "Alumni_coordinatorId_idx" ON "Alumni"("coordinatorId")';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Employer" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "coordinatorId" TEXT NOT NULL REFERENCES "User"("id"),
  "organizationName" TEXT NOT NULL,
  "contactName" TEXT,
  "contactEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Employer' AND column_name = 'coordinatorId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS "Employer_coordinatorId_idx" ON "Employer"("coordinatorId")';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "SurveyTemplate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "coordinatorId" TEXT NOT NULL REFERENCES "User"("id"),
  "title" TEXT NOT NULL,
  "stakeholderType" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SurveyTemplate_coordinatorId_idx" ON "SurveyTemplate"("coordinatorId");

CREATE TABLE IF NOT EXISTS "SurveyQuestion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "surveyTemplateId" TEXT NOT NULL REFERENCES "SurveyTemplate"("id"),
  "text" TEXT NOT NULL,
  "mappedPloId" TEXT REFERENCES "PLO"("id"),
  "orderIndex" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "SurveyQuestion_surveyTemplateId_idx" ON "SurveyQuestion"("surveyTemplateId");

CREATE TABLE IF NOT EXISTS "SurveyResponse" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "surveyTemplateId" TEXT NOT NULL REFERENCES "SurveyTemplate"("id"),
  "token" TEXT NOT NULL UNIQUE,
  "respondentType" TEXT NOT NULL,
  "respondentLabel" TEXT NOT NULL,
  "studentId" TEXT REFERENCES "Student"("id"),
  "alumniId" TEXT REFERENCES "Alumni"("id"),
  "employerId" TEXT REFERENCES "Employer"("id"),
  "submittedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SurveyResponse_surveyTemplateId_idx" ON "SurveyResponse"("surveyTemplateId");
CREATE INDEX IF NOT EXISTS "SurveyResponse_token_idx" ON "SurveyResponse"("token");

CREATE TABLE IF NOT EXISTS "SurveyAnswer" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "surveyResponseId" TEXT NOT NULL REFERENCES "SurveyResponse"("id"),
  "questionId" TEXT NOT NULL REFERENCES "SurveyQuestion"("id"),
  "ratingValue" INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "SurveyAnswer_surveyResponseId_questionId_key" ON "SurveyAnswer"("surveyResponseId", "questionId");
