-- Scopes MasterCurriculum by owning chairman — null means the shared,
-- official reference copy (visible to everyone, never directly
-- editable by OMC); set means a specific chairman's own clone, freely
-- editable by their OMC, invisible to every other chairman.
ALTER TABLE "MasterCurriculum" ADD COLUMN IF NOT EXISTS "chairmanId" TEXT;
ALTER TABLE "MasterCurriculum" ADD CONSTRAINT IF NOT EXISTS "MasterCurriculum_chairmanId_fkey"
  FOREIGN KEY ("chairmanId") REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "MasterCurriculum_chairmanId_idx" ON "MasterCurriculum"("chairmanId");
