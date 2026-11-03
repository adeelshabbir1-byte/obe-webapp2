// Curriculum comparison at CLO and topic level (queue item 11), pure part: a course's CLOs and lecture topics against the
// master course it came from. Words are compared loosely (case, spacing, punctuation) so a re-typed line is not "changed".
const norm = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export type Diff = { added: string[]; removed: string[]; changed: { from: string; to: string }[]; same: number };
/** Lists compared by position first (same place, different words = changed), then by text for the rest. */
export function diffLists(master: string[], mine: string[]): Diff {
  const out: Diff = { added: [], removed: [], changed: [], same: 0 };
  const m = master.map(norm), c = mine.map(norm);
  const cSet = new Set(c), mSet = new Set(m);
  const n = Math.max(m.length, c.length);
  for (let i = 0; i < n; i++) {
    if (i < m.length && i < c.length) {
      if (m[i] === c[i]) out.same++;
      else if (!cSet.has(m[i]) && !mSet.has(c[i])) out.changed.push({ from: master[i], to: mine[i] });
      else { if (!cSet.has(m[i])) out.removed.push(master[i]); if (!mSet.has(c[i])) out.added.push(mine[i]); if (cSet.has(m[i]) && mSet.has(c[i])) out.same++; }
    } else if (i < m.length) { if (!cSet.has(m[i])) out.removed.push(master[i]); }
    else if (!mSet.has(c[i])) out.added.push(mine[i]);
  }
  return out;
}
export const changes = (d: Diff) => d.added.length + d.removed.length + d.changed.length;
