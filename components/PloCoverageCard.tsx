import type { PloCoverageRow } from "../lib/ploCoverage";

/** PLO coverage on the Lecture Contents tab: each PLO of the course, the CLOs that feed it and how many lecture topics
 * reach it, against the OMC's minimum per PLO. Server-rendered, no interaction. */
export default function PloCoverageCard({ rows, minTopics, minPct, minItems }: { rows: PloCoverageRow[]; minTopics: number; minPct?: number; minItems?: number }) {
  if (!rows.length) return null;
  const notReached = rows.filter((r) => r.onCourse && r.clos.length === 0);
  const offCourse = rows.filter((r) => !r.onCourse);
  const short = rows.filter((r) => r.clos.length > 0 && minTopics > 0 && r.lectures < minTopics);
  return (
    <div className="card">
      <div className="lp-toolbar" style={{ marginBottom: 10 }}>
        <h3>GA coverage</h3>
        <span className="lp-meta">{minTopics > 0 ? `OMC minimum: ${minTopics} lecture topic${minTopics === 1 ? "" : "s"} per GA` : "No OMC minimum per GA"}{minPct ? ` · ${minPct}% of marks` : ""}{minItems ? ` · ${minItems} assessment item${minItems === 1 ? "" : "s"}` : ""}</span>
      </div>
      <div className="lp-chips">
        {rows.map((r) => {
          const ok = r.clos.length > 0 && r.lectures >= minTopics && r.onCourse;
          const tip = `${r.title}${r.clos.length ? ` — through ${r.clos.join(", ")}` : " — no CLO maps to it yet"}. ${r.lectures} lecture topic(s), ${r.sharePct}% of teaching lectures, ${r.marksPct}% of marks in ${r.items} assessment item(s).${!r.onCourse ? " Not one of the GAs the OMC set for this course." : ""}`;
          return (
            <span key={r.id} className={`lp-chip ${ok ? "ok" : "short"}`} title={tip}>
              <i />GA-{r.number}
              <small>{r.clos.length ? `${r.clos.join(", ")} · ${r.lectures} lecture${r.lectures === 1 ? "" : "s"} (${r.sharePct}%)${r.marksPct ? ` · ${r.marksPct}% marks` : ""}` : "no CLO yet"}{r.clos.length > 0 && minTopics > 0 && r.lectures < minTopics ? ` · ${minTopics - r.lectures} more needed` : ""}</small>
            </span>
          );
        })}
      </div>
      {notReached.length > 0 && <p className="lp-hint" style={{ color: "var(--amber-800)" }}>{notReached.map((r) => `GA-${r.number}`).join(", ")} {notReached.length === 1 ? "is" : "are"} set for this course but no CLO maps to {notReached.length === 1 ? "it" : "them"} — map a CLO on the CLOs tab, or ask the OMC to remove it.</p>}
      {offCourse.length > 0 && <p className="lp-hint" style={{ color: "var(--amber-800)" }}>{offCourse.map((r) => `GA-${r.number}`).join(", ")}: a CLO points to {offCourse.length === 1 ? "it" : "them"} but the OMC hasn&apos;t put {offCourse.length === 1 ? "it" : "them"} on this course.</p>}
      {short.length === 0 && notReached.length === 0 && offCourse.length === 0 && <p className="lp-hint">Every GA of this course is reached through its CLOs{minTopics > 0 ? " with enough lecture topics" : ""}. Hover a GA for its share of lectures and marks.</p>}
    </div>
  );
}
