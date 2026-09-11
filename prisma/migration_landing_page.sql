-- Run in Supabase SQL Editor. Adds LandingPageContent — a single-row table
-- holding the public marketing page's editable text, managed by the Super
-- User. No schema changes were needed for the batch-transcript /
-- PLO-remediation feature — it reuses existing tables.

CREATE TABLE IF NOT EXISTS "LandingPageContent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "headline" TEXT NOT NULL DEFAULT 'Outcome-Based Education Governance, Built for Accreditation',
  "subheadline" TEXT NOT NULL DEFAULT 'Design, deliver, and prove learning outcomes across your entire institution — from curriculum to classroom to accreditation report.',
  "aboutText" TEXT NOT NULL DEFAULT '',
  "missionText" TEXT NOT NULL DEFAULT '',
  "contactEmail" TEXT,
  "contactPhone" TEXT,
  "pricingNote" TEXT NOT NULL DEFAULT '',
  "featuresJson" TEXT NOT NULL DEFAULT '[]',
  "testimonialsJson" TEXT NOT NULL DEFAULT '[]',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
