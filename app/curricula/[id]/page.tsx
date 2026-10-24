import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import { ActionForm } from "../../../components/fyp/FypClient";
import { curriculumDetail, canEditMeta, LIB_ROLES, libraryScope } from "../../../lib/curriculumLibraryData";
import { canUseCurriculum, propose, LEVELS, DISCIPLINES, TERMS } from "../../../lib/curriculumLibrary";
import { typeOf } from "../../../lib/courseTypes";
import { countedCredits } from "../../../lib/courseTypes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Curriculum" };

const TABS = [["overview", "Overview"], ["semesters", "Semesters"], ["gas", "Graduate attributes"], ["used", "Who uses it"], ["versions", "Versions"]] as const;

export default async function CurriculumPage({ params, searchParams }: { params: { id: string }; searchParams: { tab?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!LIB_ROLES.includes(user.role) && !(user.extraRoles || []).includes("CURRICULUM_BUILDER")) redirect("/home");
  const d = await curriculumDetail(params.id);
  if (!d) notFound();
  const sc = await libraryScope(user);
  if (!sc.superUser && !(await canUseCurriculum(d.c, sc.chairmanId))) notFound();
  const edit = await canEditMeta(user, d.c);
  const tab = TABS.some(([k]) => k === searchParams.tab) ? searchParams.tab! : "overview";
  const p = propose(d.c, d.owner);
  const m = d.meta;
  const slotCourses = d.c.courses.filter((c) => !typeOf(c.category).listFor);
  const lists = d.c.courses.filter((c) => typeOf(c.category).listFor);
  const sems = Array.from(new Set(slotCourses.map((c) => c.semesterNumber ?? 0))).sort((a, b) => a - b);
  const total = countedCredits(d.c.courses);
  const editLink = user.role === "SUPER_USER" ? `/admin/curricula/${d.c.id}` : user.role === "DEAN" ? `/dean/curricula/${d.c.id}` : user.role === "OMC" ? "/omc/master-curriculum" : null;
  return (
    <Shell roleLabel={user.role === "SUPER_USER" ? "Super User" : roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <p className="small-note" style={{ margin: 0 }}><Link href="/curricula">← Curriculum Library</Link></p>
      <h1 style={{ fontSize: 22, margin: "4px 0" }}>{d.c.title} <span style={{ fontWeight: 400 }}>— {d.owner} {d.c.version}</span></h1>
      <div className="small-note" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "ui-monospace, Consolas, monospace", fontWeight: 700, color: "var(--fg, #0D2A4A)" }}>{m?.code || `${p.code} (proposed)`}</span>
        <span>{slotCourses.length} courses · {total} credit hours{lists.length ? ` · ${lists.length} in elective / IDS lists (not counted)` : ""} · {d.c.plos.length} GAs</span>
        <span>{d.c.status.toLowerCase()}</span>
        {m?.effectiveYear && <span>effective from {m.effectiveTerm} {m.effectiveYear}</span>}
        {d.c.chairmanId && d.colleges.length > 0 && <span>followed by {d.colleges.length} affiliated college(s)</span>}
        {edit && <Link href={`/curricula/builder/${d.c.id}`}><b>Open in Curriculum Builder</b></Link>}
        {editLink && <Link href={editLink}>Edit courses, CLOs and topics</Link>}
        <a href={`/api/master-curriculum/${d.c.id}/download`}>Download</a>
      </div>
      <div className="card" style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: 8, marginTop: 10 }}>
        {TABS.map(([k, l]) => <Link key={k} href={`/curricula/${d.c.id}?tab=${k}`} className={`btn btn-sm ${tab === k ? "" : "btn-secondary"}`}>{l}</Link>)}
      </div>

      {tab === "overview" && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Name and fields</h3>
          {edit ? (
            <ActionForm url="/api/curricula-library" fixed={{ action: "meta", id: d.c.id }} submit="Save"
              initial={{ code: m?.code || p.code, title: d.c.title, version: d.c.version, level: m?.level || p.level, programCode: m?.programCode || p.programCode, programName: m?.programName || p.programName, discipline: m?.discipline || p.discipline, notificationNo: m?.notificationNo || d.c.sourceReference || "", effectiveTerm: m?.effectiveTerm || "", effectiveYear: m?.effectiveYear || "", lockScheme: m ? m.lockScheme : true, lockGa: m ? m.lockGa : true, lockClo: m ? m.lockClo : true, announce: false }}
              fields={[
                { name: "code", label: "Code (AUTHORITY-LEVEL-PROGRAM-YEAR)" }, { name: "title", label: "Title" }, { name: "version", label: "Version" },
                { name: "level", label: "Level", type: "select", options: LEVELS }, { name: "programCode", label: "Program code (CS, SE, BBA…)" }, { name: "programName", label: "Program name" },
                { name: "discipline", label: "Discipline", type: "select", options: DISCIPLINES.map((x) => [x, x] as [string, string]) }, { name: "notificationNo", label: "Notification / reference no." },
                ...(d.c.chairmanId ? [
                  { name: "effectiveTerm", label: "Effective from term", type: "select" as const, options: [["", "—"], ...TERMS.map((t) => [t, t])] as [string, string][] }, { name: "effectiveYear", label: "Effective from year", type: "number" as const },
                  { name: "lockScheme", label: "Affiliated colleges may not change the scheme of studies", type: "checkbox" as const }, { name: "lockGa", label: "…nor the GAs", type: "checkbox" as const }, { name: "lockClo", label: "…nor the CLOs", type: "checkbox" as const },
                  { name: "announce", label: "Tell affiliated colleges now", type: "checkbox" as const },
                ] : []),
              ]} />
          ) : (
            <table style={{ fontSize: 13 }}><tbody>
              {[["Code", m?.code || p.code], ["Level", m?.level || p.level], ["Program", m?.programName || p.programName], ["Discipline", m?.discipline || p.discipline], ["Notification", m?.notificationNo || d.c.sourceReference || "—"], ["Effective from", m?.effectiveYear ? `${m.effectiveTerm} ${m.effectiveYear}` : "—"]].map(([k, v]) => <tr key={k}><td className="small-note">{k}</td><td><b>{v}</b></td></tr>)}
            </tbody></table>
          )}
          {d.c.chairmanId && <p className="small-note">A university&apos;s own curriculum: its affiliated colleges see it and must follow it. A new version with an “effective from” term applies to their batches starting in that term or later; earlier batches keep the version they started with.</p>}
        </div>
      )}

      {tab === "semesters" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
          {sems.map((s) => { const cs = slotCourses.filter((c) => (c.semesterNumber ?? 0) === s); return (
            <div key={s} className="card" style={{ margin: 0 }}>
              <b>{s ? `Semester ${s}` : "Not placed"}</b> <span className="small-note">{countedCredits(cs)} CH</span>
              <table style={{ fontSize: 12, width: "100%", marginTop: 4 }}><tbody>{cs.map((c) => <tr key={c.id}><td style={{ width: 70 }}>{c.code}</td><td>{c.title}<div className="small-note">{c.category}{c._count.seedClos ? ` · ${c._count.seedClos} CLOs` : ""}</div></td><td style={{ textAlign: "right" }}>{c.creditHours}</td></tr>)}</tbody></table>
            </div>); })}
          {lists.length > 0 && <div className="card" style={{ margin: 0 }}><b>Lists of options</b> <span className="small-note">not counted in credit hours</span>
            <table style={{ fontSize: 12, width: "100%", marginTop: 4 }}><tbody>{lists.map((c) => <tr key={c.id}><td style={{ width: 70 }}>{c.code}</td><td>{c.title}<div className="small-note">{typeOf(c.category).short}</div></td><td style={{ textAlign: "right" }}>{c.creditHours}</td></tr>)}</tbody></table></div>}
        </div>
      )}

      {tab === "gas" && (
        <div className="card">{d.c.plos.length ? <ol>{d.c.plos.map((g) => <li key={g.id} value={g.number}><b>{g.title}</b> — {g.description}</li>)}</ol> : <p className="small-note">No GAs in this curriculum.</p>}</div>
      )}

      {tab === "used" && (
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <div><b>Assigned to institutes:</b> {d.assigned.length ? d.assigned.join(", ") : d.c.chairmanId ? "— (an institute's own curriculum)" : "none yet"}</div>
          {d.c.chairmanId && <div><b>Affiliated colleges that follow it:</b> {d.colleges.length ? d.colleges.join(", ") : "none"}</div>}
          <div><b>Copies made from it:</b> {d.copies.length ? d.copies.map((x) => `${x.owner} ${x.version}`).join(", ") : "none"}</div>
          {d.c.parentCurriculum && <div><b>Copied from:</b> <Link href={`/curricula/${d.c.parentCurriculum.id}`}>{d.c.parentCurriculum.title} {d.c.parentCurriculum.version}</Link></div>}
          <div><b>Batches using it ({d.batches.length}):</b><ul style={{ margin: "4px 0" }}>{d.batches.map((b) => <li key={b.id}>{b.label}{user.role === "SUPER_USER" ? ` — ${b.institute}` : ""}</li>)}</ul></div>
        </div>
      )}

      {tab === "versions" && (
        <div className="card">
          {d.versions.length ? <table style={{ fontSize: 13 }}><thead><tr><th>Version</th><th>Status</th><th></th><th></th></tr></thead>
            <tbody>{d.versions.map((v) => <tr key={v.id}><td>{v.title} {v.version}</td><td>{v.status.toLowerCase()}</td><td><Link href={`/curricula/${v.id}`}>Open</Link></td><td><Link href={`/curricula/compare?a=${v.id}&b=${d.c.id}`}>Compare with this one</Link></td></tr>)}</tbody></table>
            : <p className="small-note">No other version of this program yet. Name the curricula (Library → Name &amp; tidy up) so versions of the same program are recognised.</p>}
        </div>
      )}
    </Shell>
  );
}
