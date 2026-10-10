-- Assessment weights can be decimals (best 3 of 4 quizzes worth 10 = 3.3333 each). Safe to run more than once.
ALTER TABLE "AssessmentInstrument" ALTER COLUMN "marksPct" TYPE DOUBLE PRECISION;
ALTER TABLE "LectureRow" ALTER COLUMN "weightPct" TYPE DOUBLE PRECISION;
