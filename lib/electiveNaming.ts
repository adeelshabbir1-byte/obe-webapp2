const ABBREVIATIONS: [RegExp, string][] = [
  [/artificial intelligence/i, "AI"],
  [/computer science/i, "CS"],
  [/cyber ?security/i, "CYS"],
  [/software engineering/i, "SE"],
  [/data science/i, "DS"],
];

/** "BS Artificial Intelligence" -> "AI", "BS Computer Science" -> "CS", etc.
 *  Falls back to the first two letters of the program name, uppercased,
 *  for any degree program not in the list above. */
export function degreeAbbreviation(degreeProgram: string): string {
  for (const [pattern, abbr] of ABBREVIATIONS) if (pattern.test(degreeProgram)) return abbr;
  return degreeProgram.slice(0, 2).toUpperCase();
}

/** Every course whose HEC-set category (courseType) is "Elective" gets a
 *  uniform "<Degree Abbreviation> Elective <N>" title instead of
 *  whatever its master template happened to be titled — matching the
 *  one-time bulk rename already applied to existing data, but now
 *  applied automatically at creation time too, so a newly imported or
 *  cloned batch never regresses back to the old inconsistent naming.
 *  `existingElectiveCount` is how many Elective-type courses this batch
 *  already has, so a fresh import numbers its new ones starting right
 *  after those — pass in a running counter across a bulk-create loop
 *  rather than re-querying per course. */
export function electiveTitleFor(degreeProgram: string, electiveNumber: number): string {
  return `${degreeAbbreviation(degreeProgram)} Elective ${electiveNumber}`;
}
