import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import Shell from "../../../../components/Shell";
import { navForRole } from "../../../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../../../lib/reportScope";
import { loadSession, sessionDays, parse, invigilatorPool } from "../../../../lib/exams";
import { ebdb, examChairman } from "../../../../lib/examBranch";
import { ActionButton } from "../../../../components/fyp/FypClient";
import DutyPrefGrid from "../../../../components/DutyPrefGrid";

export const dynamic = "force-dynamic";

// Before duties are generated: Program Leads list available staff, teachers give their preferences, the exam branch sees both.
export default async function AvailabilityPage({ params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const s = await loadSession(params.id);
  if (!s || s.chairmanId !== (await chairmanIdFor(user))) notFound();
  const shell = (c: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}><p><Link href={`/exams/${s.id}`}>← {s.name}</Link></p><h1 style={{ fontSize: 21 }}>Duty availability</h1>{c}</Shell>;
  const pool = await invigilatorPool(s.chairmanId);
  const listed = ((await ebdb.examDutyPool.findMany({ where: { sessionId: s.id } }).catch(() => null)) as { userId: string; addedById: string }[] | null);
  if (listed === null) return shell(<div className="err">Run prisma/migration_exam_branch.sql first.</div>);
  const branch = (await examChairman(user)) === s.chairmanId;
  const inList = new Set(listed.map((l) => l.userId));
  const mine = user.role === "PROGRAM_COORDINATOR" ? await prisma.user.findMany({ where: { managedById: user.id, isActive: true, OR: [{ role: "INSTRUCTOR" }, { role: "SUBJECT_EXPERT" }, { secondaryRole: "INSTRUCTOR" }] } as never, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  const prefs = (await ebdb.examDutyPref.findMany({ where: { sessionId: s.id } })) as { userId: string; slotsJson: string; maxPerDay: number; note: string | null }[];
  const myPref = prefs.find((p) => p.userId === user.id);
  const days = (await sessionDays(s)).map((d) => ({ key: d.toISOString().slice(0, 10), label: d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" }) }));
  const slots = parse<string[]>(s.slotsJson, []);
  const canTeach = pool.some((p) => p.id === user.id);
  const names = new Map(pool.map((p) => [p.id, p.name]));
  return shell(<>
    <p className="small-note">1) Program Leads tick which of their staff are available for this session (if nobody lists anyone, all teaching staff are used). 2) Each teacher marks preferred slots and a daily limit. 3) The exam branch generates duties, which respect both.</p>
    {mine.length > 0 && <div className="card"><h3 style={{ marginTop: 0 }}>Your staff available for duties</h3>
      {mine.map((m) => <div key={m.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "2px 0", fontSize: 13.5 }}><span style={{ minWidth: 220 }}>{m.name}</span>{inList.has(m.id) ? <ActionButton url={`/api/exams/${s.id}/availability`} body={{ action: "pool", userId: m.id, on: false }} label="Available ✓ (remove)" className="btn btn-secondary btn-sm" /> : <ActionButton url={`/api/exams/${s.id}/availability`} body={{ action: "pool", userId: m.id, on: true }} label="Mark available" />}</div>)}
      <div style={{ marginTop: 6 }}>{mine.filter((m) => !inList.has(m.id)).length > 0 && <span className="small-note">Tick each person, or ask the exam branch to add everyone.</span>}</div></div>}
    {canTeach && <div className="card"><h3 style={{ marginTop: 0 }}>My preferences</h3><DutyPrefGrid sessionId={s.id} days={days} slots={slots} initial={myPref ? parse<string[]>(myPref.slotsJson, []) : []} maxPerDay={myPref?.maxPerDay || 1} note={myPref?.note || ""} /></div>}
    {branch && <div className="card" style={{ overflowX: "auto" }}><h3 style={{ marginTop: 0 }}>Duty list ({listed.length ? `${listed.length} listed by Program Leads` : "nobody listed yet — all teaching staff will be used"})</h3>
      <table><thead><tr><th>Name</th><th>Listed</th><th>Preferred slots</th><th>Per day</th><th>Note</th><th /></tr></thead>
        <tbody>{pool.map((p) => { const pr = prefs.find((x) => x.userId === p.id); return (
          <tr key={p.id}><td>{p.name}</td><td>{inList.has(p.id) ? `✓ by ${names.get(listed.find((l) => l.userId === p.id)!.addedById) || "Program Lead"}` : "—"}</td><td>{pr ? parse<string[]>(pr.slotsJson, []).length : "—"}</td><td>{pr?.maxPerDay ?? "—"}</td><td style={{ fontSize: 12 }}>{pr?.note || ""}</td>
            <td><ActionButton url={`/api/exams/${s.id}/availability`} body={{ action: "pool", userId: p.id, on: !inList.has(p.id) }} label={inList.has(p.id) ? "Remove" : "Add"} className="btn btn-secondary btn-sm" /></td></tr>); })}</tbody></table></div>}
  </>);
}
