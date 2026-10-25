import { alsoUsedIn } from "../lib/gaCrosswalk";

// For the home Subject Expert: "Also used in BSCS — counts toward CGA-4, CGA-7 (course → GA set by the BSCS OMC)".
export default async function AlsoUsedIn({ courseId }: { courseId: string }) {
  const xs = await alsoUsedIn(courseId).catch(() => []);
  if (!xs.length) return null;
  return (
    <div className="card" style={{ borderLeft: "5px solid #6A4C93", background: "#F7F3FB" }}>
      {xs.map((x, i) => <div key={i} style={{ fontSize: 13 }}><b>Also used in {x.program}</b> ({x.batch}{x.title ? ` as “${x.title}”` : ""}) — counts toward {x.gas.length ? x.gas.join(", ") : "GAs not set yet"} <span className="small-note">(course → GA set by the {x.program} OMC)</span></div>)}
      <p className="small-note" style={{ margin: "4px 0 0" }}>⚠ You map CLOs to your own GAs. Changing a CLO or its GA here changes what these programs measure.</p>
    </div>
  );
}
