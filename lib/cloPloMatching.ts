// Simple, transparent keyword-overlap matching between a CLO's
// statement and a batch's own PLO statements -- deliberately not
// anything fancier (no embeddings, no external API), since the whole
// point is that these are unverified suggestions a human reviews
// afterward, not a black box. Works generically against whatever PLO
// wording actually exists for a given batch, rather than assuming any
// fixed, hardcoded PLO list.

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "for", "with", "by", "at", "from",
  "is", "are", "was", "were", "be", "been", "being", "as", "that", "this", "these", "those",
  "it", "its", "their", "his", "her", "them", "they", "he", "she", "we", "you", "i",
  "will", "would", "can", "could", "should", "shall", "may", "might", "must",
  "into", "onto", "than", "then", "so", "such", "not", "no", "also", "which", "who", "whom",
  "using", "use", "used", "student", "students", "course", "outcome", "outcomes",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
  );
}

/** Returns the best-matching PLO id and a 0-1 confidence score (overlap
 * coefficient: shared words divided by the smaller of the two token
 * sets), or null if nothing clears the minimum threshold. */
export function suggestPloForClo(
  cloStatement: string,
  plos: { id: string; statement: string }[],
  minScore = 0.2
): { ploId: string; score: number } | null {
  const cloWords = tokenize(cloStatement);
  if (cloWords.size === 0) return null;

  let best: { ploId: string; score: number } | null = null;
  for (const plo of plos) {
    const ploWords = tokenize(plo.statement);
    if (ploWords.size === 0) continue;
    let shared = 0;
    for (const w of cloWords) if (ploWords.has(w)) shared++;
    const denom = Math.min(cloWords.size, ploWords.size);
    const score = denom > 0 ? shared / denom : 0;
    if (score >= minScore && (!best || score > best.score)) best = { ploId: plo.id, score };
  }
  return best;
}

/** Given a set of (courseId, ploId) assignments about to be written
 * (new suggestions) plus whatever's already mapped, returns an even
 * percentage split per course+PLO group so contributions always sum to
 * exactly 100 -- the remainder (if 100 doesn't divide evenly) goes to
 * the first CLO in the group so the total is always exact. */
export function evenSplitContribution(count: number, index: number): number {
  const base = Math.floor(100 / count);
  const remainder = 100 - base * count;
  return index < remainder ? base + 1 : base;
}
