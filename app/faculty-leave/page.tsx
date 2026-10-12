import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { appraiseesFor } from "../../lib/appraisal";
import { termLabel } from "../../lib/courseTerm";
import { ldb, LEAVE_MANAGERS, leaveText, affectedCourses, currentTermOf, type LeaveRow } from "../../lib/facultyLeave";
import { LeaveForm, RevokeList, EndLeave } from "../../components/FacultyLeaveControls";

export const dynamic = "force-dynamic";

export default async function FacultyLeavePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!LEAVE_MANAGERS.includes(user.role) && user.role !== "DEAN") redirect("/dashboard");
  const canEdit = LEAVE_MANAGERS.includes(user.role);
  const chairmanId = await chairmanIdFor(user);
  const { people } = await appraiseesFor(user);
  let leaves: LeaveRow[] = [], missing = false;
  try { leaves = (await ldb.facultyLeave.findMany({ where: { chairmanId }, orderBy: { createdAt: "desc" }, take: 300 })) as LeaveRow[]; } catch { missing = true; }
  const names = new Map((leaves.length ? await prisma.user.findMany({ where: { id: { in: Array.from(new Set(leaves.map((l) => l.userId))) } }, select: { id: true, name: true, isActive: true } }) : []).map((u) => [u.id, u]));
  const cur = await currentTermOf(chairmanId);
  const terms = cur === null ? [] : Array.from({ length: 10 }, (_, i) => cur - 1 + i).map((v) => ({ value: v, label: termLabel(v) }));
  const active = leaves.filter((l) => !l.endedAt && (l.toTerm === null || cur === null || l.toTerm >= cur));
  const held = new Map<string, Awaited<ReturnType<typeof affectedCourses>>>();
  for (const l of active) held.set(l.id, await affectedCourses(l));
  const past = leaves.filter((l) => !active.includes(l));

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Faculty Leave</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>
        Record a teacher who is away for one or more semesters (semester leave, study leave, sabbatical, long medical leave) or who has left.
        Everything they did stays on record — lectures, marks, course plans, appraisals. They simply can&apos;t be given courses in those semesters
        (as Instructor, or as Subject Expert unless you allow it), they get no exam duties, and any course they still hold can be taken back
        in one step. Lectures they already taught stay with the course, with a note of who taught them.
      </p>
      {missing && <div className="err">The faculty leave table is not in the database yet — run prisma/migration_faculty_leave.sql in Supabase.</div>}
      {cur === null && <div className="err">The current term is not set for your programs yet (Program Leads set it), so semesters can&apos;t be chosen.</div>}

      {canEdit && cur !== null && !missing && (
        <div className="card"><h3 style={{ marginTop: 0 }}>Record leave</h3><LeaveForm people={people} terms={terms} currentTerm={cur} /></div>
      )}

      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Away now or coming up ({active.length})</h3>
        {active.length === 0 && <p style={{ color: "var(--slate)", margin: 0 }}>Nobody.</p>}
        {active.map((l) => {
          const h = held.get(l.id) || [];
          return (
            <div key={l.id} style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <b>{names.get(l.userId)?.name || "—"}</b>
                <span className={`badge ${l.kind === "LEFT" ? "badge-no" : "badge-warn"}`}>{leaveText(l)}</span>
                {l.allowDesign && <span className="badge badge-neutral">may still build course plans</span>}
                {l.kind === "LEFT" && names.get(l.userId)?.isActive === false && <span className="badge badge-neutral">login stopped</span>}
                {l.note && <span style={{ fontSize: 12, color: "var(--slate)" }}>{l.note}</span>}
                {canEdit && <span style={{ marginLeft: "auto" }}><EndLeave id={l.id} left={l.kind === "LEFT"} /></span>}
              </div>
              {h.length > 0 && (
                <div style={{ marginTop: 8, background: "#FFF8EC", padding: "8px 10px", borderRadius: 8 }}>
                  <div style={{ fontSize: 12.5, color: "#7A5208", marginBottom: 6 }}>Still holds {h.length} course(s) in these semesters:</div>
                  {canEdit ? <RevokeList leaveId={l.id} courses={h} /> : <div style={{ fontSize: 12.5 }}>{h.map((c) => c.code).join(", ")}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {past.length > 0 && (
        <div className="card" style={{ overflowX: "auto" }}>
          <h3 style={{ marginTop: 0 }}>Past leave</h3>
          <table style={{ fontSize: 12.5 }}><tbody>{past.map((l) => <tr key={l.id}><td>{names.get(l.userId)?.name || "—"}</td><td>{leaveText(l)}</td><td>{l.endedAt ? `ended ${new Date(l.endedAt).toLocaleDateString("en-GB")}` : "over"}</td><td style={{ color: "var(--slate)" }}>{l.note}</td></tr>)}</tbody></table>
        </div>
      )}
    </Shell>
  );
}
