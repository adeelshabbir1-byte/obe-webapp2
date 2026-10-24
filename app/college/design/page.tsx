import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import { prisma } from "../../../lib/db";
import { ActionButton } from "../../../components/fyp/FypClient";
import { AFFILIATE_HINT, collegeUniversity, collegeDesignBoard, marksStatus } from "../../../lib/affiliates";

export const dynamic = "force-dynamic";
export const metadata = { title: "Course design from the university" };

const CHIP: Record<string, [string, string, string]> = {
  NEW: ["Not taken yet", "#FFF1D6", "#8A5A0F"], CHANGED: ["University changed it", "#FDE7E7", "#B3261E"], SAME: ["Up to date", "#E2F4E8", "#1F5E36"], NONE: ["University has no design yet", "#EEF1F4", "#556"],
};

// An affiliated college's courses follow the university Subject Expert's design (CLOs, PLO mapping, lecture plan,
// assessments, paper blueprint). The college takes it here — and again whenever the university changes it.
export default async function CollegeDesign({ searchParams }: { searchParams: { all?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.role !== "CHAIRMAN" && user.role !== "PROGRAM_COORDINATOR") redirect("/home");
  const head = user.role === "CHAIRMAN" ? user.id : user.managedById || "";
  const shell = (x: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>{x}</Shell>;
  const uni = await collegeUniversity(head);
  if (!uni) return shell(<div className="card">This page is for affiliated colleges. Your institute is not affiliated to a university, so its own Subject Experts design its courses.</div>);
  const u = await prisma.user.findUnique({ where: { id: uni }, select: { instituteName: true, name: true } });
  const uniName = u?.instituteName || u?.name || "your university";
  let rows: Awaited<ReturnType<typeof collegeDesignBoard>>;
  try { rows = await collegeDesignBoard(head, { all: searchParams.all === "1", coordinatorId: user.role === "PROGRAM_COORDINATOR" ? user.id : undefined }); }
  catch { return shell(<div className="err">{AFFILIATE_HINT}</div>); }
  const pending = rows.filter((r) => r.state.status === "NEW" || r.state.status === "CHANGED");
  const marks = new Map<string, Awaited<ReturnType<typeof marksStatus>>>();
  for (const r of rows.slice(0, 200)) marks.set(r.id, await marksStatus(r.id).catch(() => null));
  return shell(<>
    <h1 style={{ fontSize: 22, marginBottom: 4 }}>Course design from {uniName}</h1>
    <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>As an affiliated college you have no Subject Experts and no OMC. {uniName}&apos;s Subject Expert designs each course — CLOs and their GA mapping, the lecture plan, the assessments and the paper blueprint — and your teachers follow it like any instructor. {uniName}&apos;s OMC monitors your courses. Take the design here, and again when the university changes it.</p>
    <div className="card" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
      <span><b>{rows.length}</b> {searchParams.all === "1" ? "courses" : "offered courses"} · <b style={{ color: pending.length ? "#B3261E" : "#1F5E36" }}>{pending.length}</b> to take</span>
      {pending.length > 0 && <ActionButton showMessage url="/api/affiliates" body={{ action: "takeAll", courseIds: pending.map((r) => r.id) }} label={`Take the university's design into all ${pending.length}`} confirmText="Copy the university's design into these courses? A course's own plan is replaced; a teacher who has started teaching keeps their copy." />}
      <Link className="small-note" href={searchParams.all === "1" ? "/college/design" : "/college/design?all=1"}>{searchParams.all === "1" ? "Only offered courses" : "Show all courses, offered or not"}</Link>
    </div>
    <div className="card" style={{ overflowX: "auto" }}>
      {rows.length === 0 ? <p className="small-note">No courses yet.</p> : <table style={{ fontSize: 12.5, width: "100%" }}>
        <thead><tr><th>Course</th><th>Batch</th><th>Teacher</th><th>Design from the university</th><th>Marks</th><th /></tr></thead>
        <tbody>{rows.map((r) => { const [label, bg, fg] = CHIP[r.state.status]; const m = marks.get(r.id); return (
          <tr key={r.id}>
            <td><b>{r.code}</b> {r.title}</td>
            <td>{r.batch?.degreeProgram} — {r.batch?.batchName}</td>
            <td>{r.instructor?.name || "—"}</td>
            <td><span style={{ background: bg, color: fg, borderRadius: 999, padding: "2px 8px", fontWeight: 700, fontSize: 11.5, whiteSpace: "nowrap" }}>{label}</span>
              {r.state.from && <div className="small-note" style={{ margin: "2px 0 0" }}>{r.state.from.subjectExpert?.name ? `${r.state.from.subjectExpert.name} · ` : ""}{r.state.from.batch?.degreeProgram} {r.state.from.batch?.batchName}{r.state.syncedAt ? ` · taken ${r.state.syncedAt.toISOString().slice(0, 10)}` : ""}</div>}</td>
            <td style={{ fontSize: 11.5 }}>{m ? <>College: <b style={{ color: m.college.done ? "#1F5E36" : "#8A5A0F" }}>{m.college.done ? "done" : `${m.college.got}/${m.college.need}`}</b><br />University: <b style={{ color: m.university.done ? "#1F5E36" : "#8A5A0F" }}>{m.university.items ? (m.university.done ? "done" : "pending") : "—"}</b></> : <span className="small-note">college enters all</span>}</td>
            <td>{(r.state.status === "NEW" || r.state.status === "CHANGED") && <ActionButton showMessage url="/api/affiliates" body={{ action: "take", courseId: r.id }} label={r.state.status === "NEW" ? "Take design" : "Update"} className="btn btn-sm" />}</td>
          </tr>); })}</tbody></table>}
    </div>
  </>);
}
