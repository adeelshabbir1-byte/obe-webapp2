-- Digital sign-off with QR verification (Prompt 2 item 11). Safe to run more than once.
CREATE TABLE IF NOT EXISTS "SignedDocument" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "docNo" TEXT NOT NULL, "kind" TEXT NOT NULL, "title" TEXT NOT NULL,
  "holderName" TEXT, "holderRef" TEXT, "sourceRef" TEXT, "contentHash" TEXT NOT NULL, "summaryJson" TEXT NOT NULL DEFAULT '{}',
  "signersJson" TEXT NOT NULL DEFAULT '[]', "issuedById" TEXT, "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3), "revokedById" TEXT, "revokeReason" TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS "SignedDocument_docNo_key" ON "SignedDocument" ("docNo");
CREATE INDEX IF NOT EXISTS "SignedDocument_chairmanId_kind_idx" ON "SignedDocument" ("chairmanId", "kind");
CREATE INDEX IF NOT EXISTS "SignedDocument_sourceRef_idx" ON "SignedDocument" ("sourceRef");
CREATE TABLE IF NOT EXISTS "DocumentVerification" (
  "id" TEXT PRIMARY KEY, "documentId" TEXT, "docNo" TEXT NOT NULL, "result" TEXT NOT NULL, "checkerId" TEXT, "ipHash" TEXT, "userAgent" TEXT,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "DocumentVerification_documentId_idx" ON "DocumentVerification" ("documentId");
CREATE TABLE IF NOT EXISTS "SignatureAsset" (
  "id" TEXT PRIMARY KEY, "chairmanId" TEXT NOT NULL, "userId" TEXT, "kind" TEXT NOT NULL, "mime" TEXT NOT NULL, "data" TEXT NOT NULL,
  "uploadedById" TEXT, "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "SignatureAsset_chairmanId_userId_kind_key" ON "SignatureAsset" ("chairmanId", "userId", "kind");
SELECT 'done' AS result;
