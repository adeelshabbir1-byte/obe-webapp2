// Terms are ordered Fall Y -> Spring (Y+1) -> Fall (Y+1) -> Spring (Y+2) ...
// so a linear index lets us count how many terms have passed between a
// batch's start term and "now".
function termIndex(termName: string, year: number): number {
  return termName === "Fall" ? year * 2 : year * 2 - 1;
}

/** Semester 1 in the batch's start term, +1 for every term since. Never below 1. */
export function computeCurrentSemesterNumber(
  batch: { startTerm: string; startYear: number },
  current: { termName: string; year: number }
): number {
  const diff = termIndex(current.termName, current.year) - termIndex(batch.startTerm, batch.startYear);
  return Math.max(1, diff + 1);
}
