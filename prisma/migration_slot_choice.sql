-- Elective / IDS slot choices of a batch: which list option fills which slot, who chose it, and what the slot was before.
CREATE TABLE IF NOT EXISTS "BatchSlotChoice" (
  "courseId" TEXT PRIMARY KEY, "batchId" TEXT NOT NULL, "flavour" TEXT NOT NULL, "masterCourseId" TEXT NOT NULL,
  "oldCode" TEXT NOT NULL DEFAULT '', "oldTitle" TEXT NOT NULL DEFAULT '', "oldCh" INTEGER NOT NULL DEFAULT 0,
  "byId" TEXT NOT NULL, "byName" TEXT NOT NULL DEFAULT '', "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "BatchSlotChoice_batchId_idx" ON "BatchSlotChoice"("batchId");
