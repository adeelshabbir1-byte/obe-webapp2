import { redirect } from "next/navigation";
import Sources from "../../../components/regulations/Sources";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import { prisma } from "../../../lib/db";
import { ActionForm } from "../../../components/fyp/FypClient";
import { cdb, CONSORTIUM_HINT, memberOf, rulesOn, hasValidNoc, type Centre } from "../../../lib/consortium";
import { institutionOf } from "../../../lib/consortiumAgreements";
import { MODES, modeLabel, isOdl, terms, openableCourses, problems, seatsTaken, centresOf, labOf, OFFER_ROLES, type Offering } from "../../../lib/consortiumOfferings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Consortium courses" };

// A university's courses open to students of other member universities: visiting seats in on-campus sections, and
// ODL courses (live online, blended, self-paced). Each listing is checked against the rules book.
export default async function Offerings() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const shell = (x: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>{x}</Shell>;
  if (!OFFER_ROLES.includes(user.role)) return shell(<div className="card">The Chairman, Head of Department or a Program Coordinator opens courses to the consortium.</div>);
  const me = await institutionOf(user);
  const m = me ? await memberOf(me).catch(() => undefined) : null;
  if (m === undefined) return shell(<div className="err">{CONSORTIUM_HINT}</div>);
  if (m?.status !== "ACTIVE") return shell(<div className="card">Your university is not a consortium member yet.{user.role === "CHAIRMAN" ? <> <Link href="/consortium">Apply to join →</Link></> : null}</div>);
  const { rules } = await rulesOn();
  const [offs, courses, centres, odl] = await Promise.all([
    cdb.consortiumOffering.findMany({ where: { chairmanId: me }, orderBy: [{ term: "desc" }, { createdAt: "desc" }] }) as Promise<Offering[]>,
    openableCourses(user, me!),
    cdb.examCentre.findMany({ where: { chairmanId: me, status: "ACTIVE" }, orderBy: { name: "asc" } }) as Promise<Centre[]>,
    hasValidNoc(me!, "ODL_INSTITUTIONAL"),
  ]);
  const cinfo = await prisma.course.findMany({ where: { id: { in: offs.map((o) => o.courseId) } }, select: { id: true, code: true, title: true, creditHours: true, hasLab: true, labPct: true, batch: { select: { batchName: true } } } });
  const taken = await seatsTaken(offs.map((o) => o.id));
  const issues = new Map<string, string[]>();
  for (const o of offs.filter((x) => x.status === "OPEN")) issues.set(o.id, await problems(o, rules));
  const centreFields = centres.map((c) => ({ name: `centre_${c.id}`, label: `Exam at ${c.name}${c.city ? `, ${c.city}` : ""}`, type: "checkbox" as const }));
  const common = [
    { name: "term", label: "Term", type: "select" as const, options: terms().map((t) => [t, t] as [string, string]) },
    { name: "mode", label: "Taught", type: "select" as const, width: 230, options: [["", "—"] as [string, string], ...MODES.map(([k, l]) => [k, l] as [string, string])] },
    { name: "seats", label: "Seats for consortium students", type: "number" as const, width: 110 },
    { name: "feePerCredit", label: "Fee per credit hour (PKR)", type: "number" as const, width: 120 },
    { name: "schedule", label: "Class times (e.g. Mon & Wed 10:00–11:30)", width: 280 },
    { name: "labArrangement", label: "Lab sessions (face-to-face): where and when", width: 300 },
    { name: "startsOn", label: "Classes start", type: "date" as const }, { name: "deadline", label: "Apply by", type: "date" as const },
    ...centreFields,
    { name: "about", label: "About this course for visiting students", type: "textarea" as const },
  ];
  return shell(<>
    <p className="small-note" style={{ margin: 0 }}><Link href="/consortium">← Consortium</Link> · <Link href="/catalog">Public catalog</Link></p>
    <h1 style={{ fontSize: 22, margin: "4px 0" }}>Courses open to the consortium</h1>
    <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>Open seats in your sections to students of other member universities — they appear on the public catalog. <b>On campus</b>: visiting students attend your classes. <b>ODL</b> (live online, blended, self-paced) needs your valid HEC ODL recognition{odl ? " (you have one)" : <b style={{ color: "#C62828" }}> — you have none on record</b>}, at least {String(rules.odlMinF2FBatches)} face-to-face batches of the programme, and at most {String(rules.odlMaxPerSection)} students per section. Labs stay face-to-face. Final exams are proctored at the centres you tick (students choose one their own university also approves). <Sources targets={["page:odl", "rule:odlNocRequired", "rule:odlMinF2FBatches", "rule:odlMaxPerSection", "rule:labsFaceToFace", "rule:examProctored"]} /></p>
    {!centres.length && <div className="err">Add your exam centres on the <Link href="/consortium">Consortium page</Link> first — every listing needs at least one.</div>}

    <div className="card">
      <h3 style={{ marginTop: 0 }}>Open a course</h3>
      <ActionForm showMessage url="/api/consortium/offerings" fixed={{}} submit="List on the catalog" collapsed openLabel="+ Open a course to the consortium" initial={{ term: terms()[0], feePerCredit: 0 }}
        fields={[{ name: "courseId", label: "Course (section)", type: "select", width: 420, options: [["", "—"], ...courses.map((c) => [c.id, `${c.batch?.batchName || ""} · ${c.code} ${c.title} (${c.creditHours}${labOf(c) ? ` = ${c.creditHours - labOf(c)}+${labOf(c)}` : ""} CH)`] as [string, string])] }, ...common]} />
    </div>

    <div className="card">
      <h3 style={{ marginTop: 0 }}>Your listings</h3>
      {!offs.length ? <p className="small-note">None yet.</p> : <table style={{ fontSize: 13 }}><thead><tr><th>Course</th><th>Term · mode</th><th>Seats</th><th>Fee</th><th>Status</th><th></th></tr></thead><tbody>{offs.map((o) => { const c = cinfo.find((x) => x.id === o.courseId); const is = issues.get(o.id) || []; return (
        <tr key={o.id} style={{ opacity: o.status === "OPEN" ? 1 : 0.6 }}><td><b>{c?.code}</b> {c?.title}<div className="small-note">{c?.batch?.batchName}</div></td><td>{o.term}<div className="small-note">{modeLabel(o.mode)}</div></td>
          <td>{taken.get(o.id) || 0} / {o.seats}</td><td>{o.feePerCredit ? `${o.currency} ${o.feePerCredit.toLocaleString()} / CH` : "free"}</td>
          <td>{o.status === "OPEN" ? (is.length ? <span style={{ color: "#C62828" }}>hidden: {is.join("; ")}</span> : <Link href={`/catalog/${o.id}`} style={{ color: "#2E7D32", fontWeight: 700 }}>listed</Link>) : o.status.toLowerCase()}{isOdl(o.mode) && !odl ? <div className="small-note" style={{ color: "#C62828" }}>ODL NOC missing or expired</div> : null}</td>
          <td><ActionForm showMessage url="/api/consortium/offerings" fixed={{ id: o.id }} submit="Save" collapsed openLabel="Edit"
            initial={{ ...o, deadline: o.deadline?.toISOString().slice(0, 10) || "", startsOn: o.startsOn?.toISOString().slice(0, 10) || "", ...Object.fromEntries(centres.map((x) => [`centre_${x.id}`, centresOf(o).includes(x.id)])) }}
            fields={[...common, { name: "status", label: "Listing", type: "select", options: [["OPEN", "Open for applications"], ["CLOSED", "Closed"], ["WITHDRAWN", "Withdrawn"]] }]} /></td></tr>); })}</tbody></table>}
    </div>
  </>);
}
