-- Part 6 build B: secure online quizzes from the question bank — settings, attempts (several, make-ups), integrity
-- events, make-ups. Beside OnlineQuiz / QuizAttempt (the MCQ quizzes keep working). Safe to run twice.
CREATE TABLE IF NOT EXISTS "QuizSetting" (
  "quizId" TEXT PRIMARY KEY,
  "settingsJson" TEXT NOT NULL DEFAULT '{}',
  "rulesJson" TEXT NOT NULL DEFAULT '[]',
  "idsJson" TEXT NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "QuizRun" (
  "id" TEXT PRIMARY KEY,
  "quizId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "attemptNo" INTEGER NOT NULL DEFAULT 1,
  "makeup" BOOLEAN NOT NULL DEFAULT false,
  "seed" TEXT NOT NULL,
  "questionIdsJson" TEXT NOT NULL,
  "orderJson" TEXT NOT NULL DEFAULT '{}',
  "answersJson" TEXT NOT NULL DEFAULT '{}',
  "teacherJson" TEXT NOT NULL DEFAULT '{}',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedAt" TIMESTAMP(3),
  "autoSubmitted" BOOLEAN NOT NULL DEFAULT false,
  "flagged" BOOLEAN NOT NULL DEFAULT false,
  "events" INTEGER NOT NULL DEFAULT 0,
  "lostMs" INTEGER NOT NULL DEFAULT 0,
  "pos" INTEGER NOT NULL DEFAULT 0,
  "lastBeatAt" TIMESTAMP(3),
  "untilAt" TIMESTAMP(3),
  "score" DOUBLE PRECISION,
  "maxScore" DOUBLE PRECISION,
  "perCloJson" TEXT,
  "pending" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS "QuizRun_attempt_key" ON "QuizRun" ("quizId", "studentId", "attemptNo");
CREATE INDEX IF NOT EXISTS "QuizRun_quizId_idx" ON "QuizRun" ("quizId");
CREATE TABLE IF NOT EXISTS "QuizEvent" (
  "id" TEXT PRIMARY KEY,
  "runId" TEXT NOT NULL,
  "quizId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "awayMs" INTEGER,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "QuizEvent_quizId_idx" ON "QuizEvent" ("quizId");
CREATE INDEX IF NOT EXISTS "QuizEvent_runId_idx" ON "QuizEvent" ("runId");
CREATE TABLE IF NOT EXISTS "QuizMakeup" (
  "id" TEXT PRIMARY KEY,
  "quizId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "byId" TEXT NOT NULL,
  "until" TIMESTAMP(3) NOT NULL,
  "used" BOOLEAN NOT NULL DEFAULT false,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "QuizMakeup_quiz_idx" ON "QuizMakeup" ("quizId", "studentId");
ALTER TABLE "QbExt" ADD COLUMN IF NOT EXISTS "reusable" BOOLEAN NOT NULL DEFAULT false;
