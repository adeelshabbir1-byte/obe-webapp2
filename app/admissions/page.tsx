import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { erpAccess, edb } from "../../lib/erp";
import { STAGES, SOURCES, stageLabel } from "../../lib/admissions";
import { ActionForm } from "../../components/fyp/FypClient";

export const dynamic = "force-dynamic";
type Lead = { id: string; name: string; phone: string | null; email: string | null; city: string | null; program: string | null; source: string | null; stage: string; score: number | null; nextFollowUp: Date | null; notes: string | null; studentId: string | null; createdAt: Date };

// Admission CRM: pipeline, follow-ups due, sources and conversion, each lead's history, enrolment as a student.
export default async function AdmissionsPage({ searchParams }: { searchParams: { stage?: string; q?: string; due?: string; open?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const acc = await erpAccess(user);
  if (!acc.admissions) redirect("/dashboard");
  const all = ((await edb.admissionLead.findMany({ where: { chairmanId: acc.chairmanId }, orderBy: { updatedAt: "desc" }, take: 5000 }).catch(() => null)) as Lead[] | null);
  if (all === null) return <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}><div className="err">Admissions are not set up yet — run prisma/migration_erp.sql.</div></Shell>;
  const programs = Array.from(new Set((await prisma.degreeProgram.findMany({ where: { coordinator: { managedById: acc.chairmanId } }, select: { name: true } })).map((p) => p.name)));
  const batches = await prisma.batch.findMany({ where: { coordinator: { managedById: acc.chairmanId } }, orderBy: { startYear: "desc" }, select: { id: true, degreeProgram: true, batchName: true }, take: 40 });
  const today = new Date(); today.setHours(23, 59, 59);
  const q = (searchParams.q || "").toLowerCase();
  const shown = all.filter((l) => (!searchParams.stage || l.stage === searchParams.stage) && (!searchParams.due || (l.nextFollowUp && l.nextFollowUp <= today && !["ENROLLED", "LOST"].includes(l.stage))) && (!q || `${l.name} ${l.phone} ${l.email} ${l.city} ${l.program}`.toLowerCase().includes(q)));
  const due = all.filter((l) => l.nextFollowUp && l.nextFollowUp <= today && !["ENROLLED", "LOST"].includes(l.stage)).length;
  const enrolled = all.filter((l) => l.stage === "ENROLLED").length;
  const bySource = SOURCES.map((s) => [s, all.filter((l) => l.source === s).length, all.filter((l) => l.source === s && l.stage === "ENROLLED").length] as const).filter((x) => x[1]);
  const open = searchParams.open ? all.find((l) => l.id === searchParams.open) : null;
  const acts = open ? ((await edb.leadActivity.findMany({ where: { leadId: open.id }, orderBy: { at: "desc" } })) as { kind: string; text: string; at: Date }[]) : [];
  const base = (extra: Record<string, string>) => `/admissions?${new URLSearchParams({ ...(searchParams.stage ? { stage: searchParams.stage } : {}), ...(searchParams.q ? { q: searchParams.q } : {}), ...extra }).toString()}`;
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Admissions</h1>
      <p className="small-note">Public inquiry form for your website: <a href={`/apply/${acc.chairmanId}`} target="_blank" rel="noopener noreferrer">/apply/{acc.chairmanId.slice(0, 8)}…</a> — inquiries arrive here as leads.</p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        <Link href="/admissions" className="act">All {all.length}</Link>
        {STAGES.map(([k, v]) => <Link key={k} href={`/admissions?stage=${k}`} className="act" style={{ fontWeight: searchParams.stage === k ? 700 : 400 }}>{v} {all.filter((l) => l.stage === k).length}</Link>)}
        <Link href="/admissions?due=1" className="act" style={{ color: due ? "#B3261E" : undefined }}>Follow-ups due {due}</Link>
      </div>
      <div className="card" style={{ fontSize: 13 }}>Conversion: <b>{all.length ? Math.round((100 * enrolled) / all.length) : 0}%</b> of leads enrolled · Sources: {bySource.map(([s, n, e]) => `${s} ${n} (${e} enrolled)`).join(" · ") || "—"}</div>
      <div className="card"><ActionForm url="/api/admissions" fixed={{ action: "add" }} submit="Add lead" collapsed openLabel="Add a lead" initial={{ source: "Walk-in", program: programs[0] || "" }}
        fields={[{ name: "name", label: "Name", width: 180 }, { name: "phone", label: "Phone", width: 130 }, { name: "email", label: "Email", width: 180 }, { name: "city", label: "City", width: 110 }, { name: "program", label: "Program", type: "select", options: programs.map((p) => [p, p] as [string, string]) }, { name: "source", label: "Source", type: "select", options: SOURCES.map((s) => [s, s] as [string, string]) }, { name: "nextFollowUp", label: "Follow up on", type: "date" }, { name: "notes", label: "Notes", type: "textarea" }]} /></div>
      {open && (
        <div className="card" style={{ borderLeft: "4px solid #1B6CA8" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><h3 style={{ margin: 0 }}>{open.name} <span className="small-note">{stageLabel(open.stage)}</span></h3><Link href={base({})}>Close</Link></div>
          <p className="small-note">{[open.phone, open.email, open.city, open.program, open.source].filter(Boolean).join(" · ")}{open.score != null ? ` · score ${open.score}` : ""}</p>
          {open.notes && <p style={{ fontSize: 13 }}>{open.notes}</p>}
          <ActionForm url="/api/admissions" fixed={{ action: "stage", leadId: open.id }} submit="Move" initial={{ stage: open.stage, score: open.score ?? "" }} fields={[{ name: "stage", label: "Stage", type: "select", options: STAGES.map(([k, v]) => [k, v] as [string, string]) }, { name: "score", label: "Test / merit score", type: "number", width: 90 }, { name: "note", label: "Note", width: 200 }]} />
          <ActionForm url="/api/admissions" fixed={{ action: "log", leadId: open.id }} submit="Log" initial={{ kind: "CALL" }} fields={[{ name: "kind", label: "Contact", type: "select", options: [["CALL", "Call"], ["SMS", "SMS / WhatsApp"], ["EMAIL", "Email"], ["VISIT", "Visit"], ["NOTE", "Note"]] }, { name: "text", label: "What happened", width: 260 }, { name: "nextFollowUp", label: "Next follow-up", type: "date" }]} />
          {!open.studentId && ["ADMITTED", "OFFERED", "MERIT"].includes(open.stage) && <ActionForm url="/api/admissions" fixed={{ action: "enrol", leadId: open.id }} submit="Enrol as student" initial={{ batchId: batches[0]?.id || "" }} fields={[{ name: "batchId", label: "Batch", type: "select", options: batches.map((b) => [b.id, `${b.degreeProgram} — ${b.batchName}`] as [string, string]) }, { name: "rollNumber", label: "Roll number", width: 140 }]} />}
          <div style={{ marginTop: 8, fontSize: 12.5 }}>{acts.map((a, i) => <div key={i}><span className="small-note">{a.at.toISOString().slice(0, 16).replace("T", " ")} · {a.kind.toLowerCase()}</span> {a.text}</div>)}</div>
        </div>
      )}
      <div className="card" style={{ overflowX: "auto" }}>
        <form style={{ marginBottom: 8 }}>{searchParams.stage && <input type="hidden" name="stage" value={searchParams.stage} />}<input name="q" defaultValue={searchParams.q || ""} placeholder="Search name, phone, city, program" style={{ width: 280 }} /> <button className="btn btn-secondary btn-sm">Find</button></form>
        <table><thead><tr><th>Name</th><th>Program</th><th>Stage</th><th>Source</th><th>Follow-up</th></tr></thead>
          <tbody>{shown.slice(0, 300).map((l) => <tr key={l.id}><td><Link href={base({ open: l.id })}><b>{l.name}</b></Link><div className="small-note">{l.phone || l.email} · {l.city || ""}</div></td><td>{l.program || "—"}</td><td>{stageLabel(l.stage)}</td><td>{l.source || "—"}</td>
            <td style={{ color: l.nextFollowUp && l.nextFollowUp <= today && !["ENROLLED", "LOST"].includes(l.stage) ? "#B3261E" : undefined }}>{l.nextFollowUp ? l.nextFollowUp.toISOString().slice(0, 10) : "—"}</td></tr>)}</tbody></table>
        {shown.length === 0 && <p className="small-note">No leads.</p>}
      </div>
    </Shell>
  );
}
