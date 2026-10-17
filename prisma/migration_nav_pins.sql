-- Pinned menu links ("My work") per person. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "UserNavPref" (
  "userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
  "pinsJson" TEXT NOT NULL DEFAULT '[]',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
SELECT 'done' AS result;
