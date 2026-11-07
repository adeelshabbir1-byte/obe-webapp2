import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import StudentShell from "../../../components/StudentShell";
import { ActionForm, ActionButton } from "../../../components/fyp/FypClient";
import * as N from "../../../lib/networkDegrees";

export const dynamic = "force-dynamic";
export const metadata = { title: "Network degree planner" };

// Queue item 21: a student plans the degree semester by semester — home courses, or an approved equivalent at another
// member university where the home plan allows it — within the residency limit, with a study centre in their city.
const URL = "/api/student/consortium";
export default async function StudentNetwork() {
  const st = await getAuthenticatedStudent();
  if (!st) redirect("/student/login");
  const p = await N.planner(st.id).catch(() => null);
  const shell = (x: React.ReactNode) => <StudentShell studentName={st.name}><h1 style={{ fontSize: 22, marginBottom: 4 }}>Network degree planner</h1>{x}</StudentShell>;
  if (!p) return shell(<div className="card">{N.NET_HINT}</div>);
  const sems: number[] = Array.from(new Set<number>(p.rows.map((r) => (r.semesterNumber ?? 0) as number))).sort((a, b) => a - b);
  return shell(<>
    <p className="small-note" style={{ marginTop: 0 }}>{p.program} · {p.batch}. {p.plan ? `Your university's plan for ${p.plan.intake} (Board of Studies: ${p.plan.bos}) marks which courses may be taken elsewhere.` : "Your university has not published which courses may be taken elsewhere yet — every course is home only for now."} Seats are applied for on <Link href="/student/consortium">Consortium courses</Link>.</p>
    <div className="card" style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
      <span>Credits planned elsewhere: <b style={{ color: p.outsidePct > p.maxOutsidePct ? "#B3261E" : undefined }}>{p.outsidePct}%</b> of at most {p.maxOutsidePct}%</span>
      <span>Study centre: {p.centre ? `${p.centre.city}${p.centre.centreId ? "" : " (not placed yet)"}` : "—"} <ActionForm url={URL} fixed={{ action: "city" }} collapsed openLabel={p.centre ? "Change city" : "Give my city"} submit="Save" showMessage fields={[{ name: "city", label: "City you live in" }]} /></span>
      <span>Consent to share my records with the host: {p.consent ? <b>given ✓</b> : <ActionButton url={URL} body={{ action: "consent", yes: true }} label="I agree" confirmText="Your university may share your enrolment, results and CLO records with the member university where you take a course. Agree?" />}{p.consentRequired && !p.consent ? <span className="small-note"> (needed before applying)</span> : null}</span>
    </div>
    {sems.map((s) => <div key={s} className="card" style={{ overflowX: "auto" }}><h3 style={{ marginTop: 0 }}>Semester {s || "—"}</h3>
      <table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Course</th><th>CH</th><th>Where</th><th>Options elsewhere</th></tr></thead>
        <tbody>{p.rows.filter((r) => (r.semesterNumber ?? 0) === s).map((r) => <tr key={r.id}><td>{r.code} {r.title}{r.done ? " ✓" : ""}</td><td>{r.creditHours}</td>
          <td>{r.choice && r.choice !== p.home ? <><b>{r.choiceName}</b> <ActionButton url={URL} body={{ action: "netplan", courseId: r.id, offeringId: "" }} label="Back home" className="btn btn-secondary btn-sm" showMessage /></> : `Home${r.label === "HOME" ? " (home only)" : ""}`}</td>
          <td>{r.label === "HOME" ? "—" : !r.options.length ? <span className="small-note">no partner offers an approved equivalent yet</span> : r.options.map((o) => <div key={o.offeringId} style={{ marginBottom: 2 }}>{o.university}{o.city ? `, ${o.city}` : ""} · {o.mode.toLowerCase().replace("_", " ")} · {o.term} · {o.seatsLeft} seats {o.open && <ActionButton url={URL} body={{ action: "netplan", courseId: r.id, offeringId: o.offeringId }} label="Plan here" className="btn btn-secondary btn-sm" showMessage />}</div>)}</td></tr>)}</tbody></table></div>)}
  </>);
}
