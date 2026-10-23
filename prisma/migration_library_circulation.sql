-- Library circulation (Prompt 2 item 5): catalogue, copies with accession numbers, loans, holds, fines and the
-- Librarian's rules. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "LibraryTitle" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "title" TEXT NOT NULL, "authors" TEXT, "isbn" TEXT, "edition" TEXT, "publisher" TEXT,
  "year" INTEGER, "subject" TEXT NOT NULL DEFAULT 'General', "callNumber" TEXT, "kind" TEXT NOT NULL DEFAULT 'PRINT', "url" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "LibraryTitle_chairmanId_idx" ON "LibraryTitle" ("chairmanId");
CREATE INDEX IF NOT EXISTS "LibraryTitle_isbn_idx" ON "LibraryTitle" ("isbn");
CREATE TABLE IF NOT EXISTS "LibraryCopy" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "titleId" TEXT NOT NULL, "accessionNo" TEXT NOT NULL, "location" TEXT,
  "status" TEXT NOT NULL DEFAULT 'AVAILABLE', "price" DOUBLE PRECISION, "acquiredAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "LibraryCopy_chairmanId_accessionNo_key" ON "LibraryCopy" ("chairmanId", "accessionNo");
CREATE INDEX IF NOT EXISTS "LibraryCopy_titleId_idx" ON "LibraryCopy" ("titleId");
CREATE TABLE IF NOT EXISTS "LibraryLoan" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "copyId" TEXT NOT NULL, "titleId" TEXT NOT NULL, "memberType" TEXT NOT NULL, "memberId" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "dueAt" TIMESTAMP(3) NOT NULL, "returnedAt" TIMESTAMP(3), "renewals" INTEGER NOT NULL DEFAULT 0,
  "fine" DOUBLE PRECISION NOT NULL DEFAULT 0, "finePaid" DOUBLE PRECISION NOT NULL DEFAULT 0, "fineWaived" BOOLEAN NOT NULL DEFAULT false, "note" TEXT,
  "outcome" TEXT, "remindedAt" TIMESTAMP(3), "issuedById" TEXT, "returnedById" TEXT
);
CREATE INDEX IF NOT EXISTS "LibraryLoan_member_idx" ON "LibraryLoan" ("memberType", "memberId");
CREATE INDEX IF NOT EXISTS "LibraryLoan_copyId_idx" ON "LibraryLoan" ("copyId");
CREATE INDEX IF NOT EXISTS "LibraryLoan_chairmanId_idx" ON "LibraryLoan" ("chairmanId", "returnedAt");
CREATE TABLE IF NOT EXISTS "LibraryHold" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "titleId" TEXT NOT NULL, "memberType" TEXT NOT NULL, "memberId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'WAITING', "readyAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "LibraryHold_titleId_idx" ON "LibraryHold" ("titleId", "status");
CREATE TABLE IF NOT EXISTS "LibraryPolicy" (
  "chairmanId" TEXT PRIMARY KEY, "studentLimit" INTEGER NOT NULL DEFAULT 3, "studentDays" INTEGER NOT NULL DEFAULT 14, "staffLimit" INTEGER NOT NULL DEFAULT 10,
  "staffDays" INTEGER NOT NULL DEFAULT 30, "finePerDay" DOUBLE PRECISION NOT NULL DEFAULT 20, "maxRenewals" INTEGER NOT NULL DEFAULT 2,
  "holdDays" INTEGER NOT NULL DEFAULT 3, "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Off while the collection is still being entered: the typed figures on Library facilities are kept until then.
ALTER TABLE "LibraryPolicy" ADD COLUMN IF NOT EXISTS "catalogueFigures" BOOLEAN NOT NULL DEFAULT true;
SELECT 'done' AS result;
