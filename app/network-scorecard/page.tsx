import Link from "next/link";
import { scorecard } from "../../lib/networkDegrees";

export const dynamic = "force-dynamic";
export const metadata = { title: "Consortium quality scorecard" };

// Queue item 21: public — for each member university, the courses it opens to the network, the students it taught,
// their pass rate and how many offerings had their yearly quality review. Counts only; no names.
export default async function NetworkScorecard() {
  const rows = await scorecard().catch(() => []);
  return <main style={{ maxWidth: 980, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif" }}>
    <h1 style={{ fontSize: 24, marginBottom: 4 }}>OBEHUB consortium — quality scorecard</h1>
    <p style={{ color: "#555", fontSize: 14, marginTop: 0 }}>Every member university opens courses to students of the others under one set of rules. These figures come from the consortium&apos;s own records. <Link href="/catalog">Course catalog →</Link></p>
    {!rows.length ? <p>No member universities yet.</p> : <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}><thead><tr>{["University", "City", "Courses open", "Visiting students taught", "Results", "Pass rate", "Yearly reviews done"].map((h) => <th key={h} style={{ textAlign: "left", borderBottom: "2px solid #333", padding: 6 }}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{[r.university, r.city || "—", r.offerings, r.students, r.results, r.passPct === null ? "—" : `${r.passPct}%`, `${r.reviewed} of ${r.offerings}`].map((v, j) => <td key={j} style={{ borderBottom: "1px solid #ddd", padding: 6 }}>{v}</td>)}</tr>)}</tbody></table></div>}
  </main>;
}
