-- Help center: the institute's own guides and FAQs, help-desk requests and their replies, "was this helpful" votes,
-- and searches that found nothing. Run in the Supabase SQL editor AFTER migration_nbeac_sar.sql.
-- Safe to run more than once (every statement is IF NOT EXISTS). The built-in manual and FAQ need no tables.
-- Self-service password reset uses the existing "PasswordResetToken" table.

-- CreateTable
CREATE TABLE IF NOT EXISTS "HelpArticle" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT,
    "kind" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "stepsJson" TEXT,
    "whoCan" TEXT,
    "affects" TEXT,
    "roles" TEXT NOT NULL DEFAULT '',
    "pages" TEXT NOT NULL DEFAULT '',
    "keywords" TEXT NOT NULL DEFAULT '',
    "href" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "sourceTicketId" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "HelpTicket" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT,
    "desk" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "query" TEXT,
    "page" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "requesterUserId" TEXT,
    "requesterStudentId" TEXT,
    "requesterName" TEXT NOT NULL,
    "requesterRole" TEXT NOT NULL,
    "recipientIds" TEXT NOT NULL,
    "assignedToId" TEXT,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "HelpTicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "authorStudentId" TEXT,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpTicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "HelpFeedback" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT,
    "articleKey" TEXT NOT NULL,
    "helpful" BOOLEAN NOT NULL,
    "role" TEXT NOT NULL,
    "voterKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "HelpSearchLog" (
    "id" TEXT NOT NULL,
    "chairmanId" TEXT,
    "role" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "results" INTEGER NOT NULL,
    "page" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpSearchLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "HelpArticle_chairmanId_idx" ON "HelpArticle"("chairmanId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "HelpTicket_chairmanId_status_idx" ON "HelpTicket"("chairmanId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "HelpTicket_requesterUserId_idx" ON "HelpTicket"("requesterUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "HelpTicket_requesterStudentId_idx" ON "HelpTicket"("requesterStudentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "HelpTicketMessage_ticketId_idx" ON "HelpTicketMessage"("ticketId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "HelpFeedback_chairmanId_idx" ON "HelpFeedback"("chairmanId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "HelpFeedback_articleKey_voterKey_key" ON "HelpFeedback"("articleKey", "voterKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "HelpSearchLog_chairmanId_createdAt_idx" ON "HelpSearchLog"("chairmanId", "createdAt");

-- Self-service password reset links. The table is part of the original schema; created here only if an older
-- database never got it.
CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PasswordResetToken_userId_fkey') THEN
    ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
