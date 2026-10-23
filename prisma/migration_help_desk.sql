-- Help desk upgrade (Prompt 2 item 10): kind, priority, screenshot, browser, SLA timers, tags, fix / release note and the
-- FAQ made from a ticket; and each institute's own support people and SLA hours. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "HelpTicketExtra" (
  "ticketId" TEXT PRIMARY KEY, "category" TEXT NOT NULL DEFAULT 'HOW_TO', "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "screenshot" TEXT, "browser" TEXT, "pageUrl" TEXT, "slaDueAt" TIMESTAMP(3), "firstResponseAt" TIMESTAMP(3), "slaWarnedAt" TIMESTAMP(3),
  "tags" TEXT NOT NULL DEFAULT '', "fixNote" TEXT, "releaseRef" TEXT, "faqArticleId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "HelpDeskSetting" (
  "chairmanId" TEXT PRIMARY KEY, "supportUserIds" TEXT NOT NULL DEFAULT '[]', "slaHoursJson" TEXT NOT NULL DEFAULT '{}',
  "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
SELECT 'done' AS result;
