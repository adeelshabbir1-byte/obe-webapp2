import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { ActionButton, ActionForm } from "../../components/fyp/FypClient";
import CourseHomeBoard from "../../components/CourseHomeBoard";
import { HOMES_HINT, baseFlags, board, catalogRows, draftsOf, matches, structure } from "../../lib/courseHomes";
import { committeesFor } from "../../lib/committeeEngine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Course homes and codes" };
const VIEW = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "PROGRAM_LEAD", "OMC", "DEPARTMENT_COORDINATOR"];

// Course homes and codes: where each course lives (GE, a teaching department, department common, one program) and its
// PREFIX-YCN code; drafts by the Dean (phase 1), the Institute Head / HOD (phase 2) and Program Leads (tracks, chains);
// only the BOS approves. Also: matches across degrees, flags, prefixes and chains, the content-sync base, the catalog.
export default async function CourseHomes({ searchParams }: { searchParams: { tab?: string; draft?: string; dept?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!VIEW.includes(user.role)) redirect("/dashboard");
  const chairmanId = await chairmanIdFor(user as never).catch(() => "");
  const tab = ["board", "matches", "flags", "base", "settings", "catalog"].includes(searchParams.tab || "") ? searchParams.tab! : "board";
  let missing = false;
  const drafts = await draftsOf(chairmanId).catch(() => { missing = true; return []; });
  const draftId = drafts.some((d) => d.id === searchParams.draft) ? searchParams.draft! : null;
  const b = missing ? null : await board(chairmanId, draftId);
  const st = missing ? null : await structure(chairmanId);
  const pl = ["PROGRAM_COORDINATOR", "PROGRAM_LEAD"].includes(user.role);
  const myPrograms = pl ? Array.from(new Set((await prisma.batch.findMany({ where: { coordinatorId: user.id }, select: { degreeProgram: true } })).map((x) => x.degreeProgram))) : [];
  const phase = user.role === "DEAN" || (user.role === "CHAIRMAN" && !searchParams.dept) ? "DEAN" : pl ? "PL" : "DEPT";
  const deptId = phase === "DEAN" ? null : searchParams.dept || (pl ? st?.programs.find((p) => myPrograms.includes(p.name))?.departmentId : user.departmentId) || st?.depts[0]?.id || null;
  const tdb = prisma as unknown as Record<string, any>;
  const offers = (await tdb.batchTrackOffer.findMany({ where: { batchId: { in: (await prisma.batch.findMany({ where: { coordinator: { managedById: chairmanId } }, select: { id: true } })).map((x) => x.id).concat("none") } } }).catch(() => [])) as { batchId: string; trackId: string; name: string }[];
  const trackNames = new Map(((await tdb.curriculumTrack.findMany({ where: { id: { in: offers.map((o) => o.trackId).concat("none") } }, select: { id: true, name: true } }).catch(() => [])) as { id: string; name: string }[]).map((t) => [t.id, t.name]));
  const batchProg = new Map((await prisma.batch.findMany({ where: { id: { in: offers.map((o) => o.batchId).concat("none") } }, select: { id: true, degreeProgram: true } })).map((x) => [x.id, x.degreeProgram]));
  const tracks: Record<string, string[]> = {};
  for (const o of offers) { const p = batchProg.get(o.batchId); const n = o.name || trackNames.get(o.trackId); if (p && n) tracks[p] = Array.from(new Set([...(tracks[p] || []), n])); }
  const boses = (await committeesFor(chairmanId, user).catch(() => [])).filter((c) => c.type === "BOS");
  const T = (k: string, l: string) => <Link key={k} href={`/course-homes?tab=${k}${draftId ? `&draft=${draftId}` : ""}`} className={`btn btn-sm ${tab === k ? "btn-brass" : "btn-secondary"}`}>{l}</Link>;

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Course homes and codes</h1>
      <p className="small-note" style={{ marginBottom: 8 }}>A course lives at the highest level where it is shared and takes that level&apos;s prefix; its code is PREFIX-YCN. The Dean places courses by department, the Institute Head / HOD by program, Program Leads adjust tracks and chains — all as drafts. <b>Only the BOS approves</b>; after that homes and codes are locked, a changed code keeps the old one as an alias, and finished offerings (and transcripts) keep the code they were taken under.</p>
      {missing && <div className="card"><p style={{ color: "#B3261E", margin: 0 }}>{HOMES_HINT}</p></div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>{T("board", "Board")}{T("matches", "Same course across degrees")}{T("flags", "Flags")}{T("base", "Content-sync base")}{T("settings", "Prefixes & chains")}{T("catalog", "Approved catalog")}</div>

      {tab === "board" && b && st && (
        <>
          <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 13 }}>{draftId ? <>Draft <b>{draftId.slice(0, 8)}</b> ({drafts.find((d) => d.id === draftId)?.status === "SENT" ? "with the BOS" : "not sent yet"})</> : "Approved homes and codes (changes start a new draft)"}</span>
            {drafts.map((d) => <Link key={d.id} href={`/course-homes?draft=${d.id}`} className="small-note">draft {d.id.slice(0, 8)} · {d.status === "SENT" ? "with the BOS" : "draft"}</Link>)}
            {draftId && drafts.find((d) => d.id === draftId)?.status === "DRAFT" && (boses.length ? <ActionForm url="/api/course-homes" fixed={{ action: "send", draftId }} submit="Send to BOS" collapsed openLabel="Send to BOS…" showMessage initial={{ committeeId: boses[0].id }} fields={[{ name: "committeeId", label: "Board of Studies", type: "select", options: boses.map((c) => [c.id, c.name] as [string, string]), width: 260 }]} /> : <span className="small-note">No Board of Studies yet — set one up under <Link href="/boards">Boards &amp; committees</Link>.</span>)}
            {phase !== "DEAN" && !pl && <form method="get" style={{ display: "inline-flex", gap: 6 }}><input type="hidden" name="tab" value="board" />{draftId && <input type="hidden" name="draft" value={draftId} />}<select name="dept" defaultValue={deptId || ""}>{st.depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select><button className="btn btn-secondary btn-sm">Show</button></form>}
            {user.role === "CHAIRMAN" && <Link className="small-note" href={phase === "DEAN" ? `/course-homes?dept=${st.depts[0]?.id || ""}${draftId ? `&draft=${draftId}` : ""}` : `/course-homes${draftId ? `?draft=${draftId}` : ""}`}>{phase === "DEAN" ? "Phase 2: by program →" : "← Phase 1: by department"}</Link>}
          </div>
          <CourseHomeBoard rows={b.rows} depts={st.depts} programs={st.programs} chains={b.chains} tracks={tracks} phase={phase} deptId={deptId} myPrograms={myPrograms} draftId={draftId && drafts.find((d) => d.id === draftId)?.status === "DRAFT" ? draftId : null} />
        </>
      )}

      {tab === "matches" && await (async () => {
        const ms = await matches(chairmanId).catch(() => []);
        return (
          <div className="card" style={{ overflowX: "auto" }}>
            <p className="small-note" style={{ margin: "0 0 6px" }}>The same course under different titles: from content-sync and equivalence groups, titles alike in meaning, and overlapping CLOs and topics. Confirm to treat them as one course (one home, one code).</p>
            <table className="table" style={{ width: "100%", fontSize: 13 }}><thead><tr><th>Course</th><th>Same as</th><th>Confidence</th><th>Why</th><th></th></tr></thead>
              <tbody>{ms.map((m) => <tr key={`${m.a}~${m.b}`}><td>{m.titleA}</td><td>{m.titleB}</td><td>{m.confidence}%</td><td className="small-note">{m.reason}</td><td><ActionButton url="/api/course-homes" body={{ action: "match", fromKey: m.b, toKey: m.a, reason: m.reason }} label="Same course" className="btn btn-secondary btn-sm" /></td></tr>)}{!ms.length && <tr><td colSpan={5} className="small-note">No matches to confirm.</td></tr>}</tbody></table>
          </div>
        );
      })()}

      {tab === "flags" && b && (
        <div className="card">
          {b.rows.filter((r) => r.flags.length).map((r) => <p key={r.key} style={{ margin: "3px 0", fontSize: 13 }}><b>{r.code || "—"}</b> {r.title} — {r.flags.join(" · ")}</p>)}
          {!b.rows.some((r) => r.flags.length) && <p className="small-note" style={{ margin: 0 }}>No duplicate codes, full chains or misplaced homes.</p>}
        </div>
      )}

      {tab === "base" && await (async () => {
        const fl = await baseFlags(chairmanId).catch(() => []);
        const can = ["OMC", "CHAIRMAN", "HEAD_OF_DEPARTMENT"].includes(user.role);
        return (
          <div className="card">
            <p className="small-note" style={{ margin: "0 0 6px" }}>The latest copy in the course&apos;s home is its content-sync base: its program; the department&apos;s lead program for department-common courses; the teaching department for service and GE courses (a department-level copy when it has no batch). The base&apos;s Subject Expert comes from the home department.</p>
            {fl.map((f) => <div key={f.groupId} style={{ borderTop: "1px solid #eee", padding: "6px 0", fontSize: 13, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }} data-base-flag={f.code || f.title}><span>{f.text}</span>{can && !f.planned && <ActionButton url="/api/course-homes" body={{ action: "makeBase", groupId: f.groupId }} label="Make the home copy the base" confirmText="Move the base to the home department's copy? The old base's Subject Expert is told; content carries forward from the new base." />}</div>)}
            {!fl.length && <p className="small-note" style={{ margin: 0 }}>Every group&apos;s base is in its course&apos;s home.</p>}
          </div>
        );
      })()}

      {tab === "settings" && st && (
        <>
          <div className="card" style={{ overflowX: "auto" }}>
            <b>Prefixes</b> <span className="small-note">— department prefixes are set by the Dean (<Link href="/dean/course-codes">Course codes</Link>); program prefixes by the Institute Head. Unique within the institute.</span>
            <table className="table" style={{ width: "100%", fontSize: 13, marginTop: 6 }}><thead><tr><th>Department / program</th><th>Prefix</th><th>Lead program</th></tr></thead>
              <tbody>{st.depts.map((d) => [
                <tr key={d.id}><td><b>{d.name}</b></td><td>{d.prefix || <span className="small-note">not set</span>}</td><td>{st.leadOf(d.id) || "—"}{["CHAIRMAN", "HEAD_OF_DEPARTMENT"].includes(user.role) && st.programs.some((p) => p.departmentId === d.id) && <ActionForm url="/api/course-homes" fixed={{ action: "leadProgram", departmentId: d.id }} submit="Set" collapsed openLabel="Change" initial={{ program: st.leadOf(d.id) || "" }} fields={[{ name: "program", label: "Lead program", type: "select", options: st.programs.filter((p) => p.departmentId === d.id).map((p) => [p.name, p.name] as [string, string]) }]} />}</td></tr>,
                ...st.programs.filter((p) => p.departmentId === d.id).map((p) => <tr key={p.name}><td style={{ paddingLeft: 24 }}>{p.name}</td><td>{p.prefix || <span className="small-note">uses {d.prefix || "—"}</span>}{["CHAIRMAN", "HEAD_OF_DEPARTMENT"].includes(user.role) && <ActionForm url="/api/course-homes" fixed={{ action: "programPrefix", program: p.name, departmentId: d.id }} submit="Save" collapsed openLabel="Set" initial={{ prefix: p.prefix || "" }} fields={[{ name: "prefix", label: "Prefix (2–3 letters)", type: "text", width: 80 }]} />}</td><td /></tr>),
              ])}</tbody></table>
          </div>
          <div className="card">
            <b>Chains (C in PREFIX-YCN)</b> <span className="small-note">— each department&apos;s subject areas, editable by the department.</span>
            {st.depts.filter((d) => !deptId || phase === "DEAN" || d.id === deptId).map((d) => (
              <div key={d.id} style={{ marginTop: 6, fontSize: 12 }}><b>{d.name}</b>: {(b?.chains[d.id] || []).map((c) => `${c.chain} ${c.name}`).join(" · ")}
                {(["CHAIRMAN", "DEAN"].includes(user.role) || (user.role === "HEAD_OF_DEPARTMENT" && user.departmentId === d.id)) && <ActionForm url="/api/course-homes" fixed={{ action: "chain", departmentId: d.id }} submit="Save" collapsed openLabel="Rename a chain" initial={{ chain: 0 }} fields={[{ name: "chain", label: "Chain", type: "number", width: 70 }, { name: "name", label: "Name", type: "text", width: 220 }]} />}
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "catalog" && await (async () => {
        const rows = await catalogRows(chairmanId).catch(() => []);
        return (
          <div className="card" style={{ overflowX: "auto" }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}><a className="btn btn-secondary btn-sm" href="/api/course-homes?export=xlsx">Excel</a><a className="btn btn-secondary btn-sm" href="/api/course-homes?export=pdf">PDF (prospectus)</a></div>
            <table className="table" style={{ width: "100%", fontSize: 13 }}><thead><tr><th>Code</th><th>Title</th><th>CH</th><th>Prerequisites</th><th>Home</th><th>Category</th><th>Old codes</th></tr></thead>
              <tbody>{rows.map((r) => <tr key={r.code + r.title}><td><b>{r.code}</b></td><td>{r.title}</td><td>{r.creditHours}</td><td className="small-note">{r.prerequisites}</td><td className="small-note">{r.home}</td><td className="small-note">{r.category}</td><td className="small-note">{r.aliases}</td></tr>)}{!rows.length && <tr><td colSpan={7} className="small-note">Nothing approved by the BOS yet.</td></tr>}</tbody></table>
          </div>
        );
      })()}
    </Shell>
  );
}
