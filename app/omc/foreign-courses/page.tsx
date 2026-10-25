import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { OMC_ACTION_NAV, navForRole } from "../../../components/reportNav";
import { ActionForm } from "../../../components/fyp/FypClient";
import { foreignCourses } from "../../../lib/gaCrosswalk";

// "Courses of other departments for <term>": our OMC decides each course → our GAs (suggested from the crosswalk or
// last term), 2 members confirm (or the course's panel). CLO → our GA is translated from the home SE's mapping.
export default async function ForeignCoursesPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const chairmanId = user.role === "CHAIRMAN" ? user.id : user.managedById || "none";
  const leads = (await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId }, select: { id: true } })).map((u) => u.id);
  const rows = await foreignCourses(chairmanId, user.role === "PROGRAM_COORDINATOR" ? [user.id] : leads).catch(() => []);
  const ga = (r: (typeof rows)[number], id: string) => { const p = r.plos.find((x) => x.id === id); return p ? `GA${p.number}` : "?"; };
  return (
    <Shell roleLabel={user.role === "OMC" ? "OMC Member" : "Faculty"} userName={user.name} navLinks={user.role === "OMC" ? OMC_ACTION_NAV : navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Courses from Other Departments</h1>
      <p style={{ color: "var(--slate)", fontSize: 13 }}>Courses this term (and next semester) whose home is another department. Our OMC decides which of <b>our</b> GAs each course serves; the CLO → GA mapping comes from the home Subject Expert, translated through the GA crosswalk. Two confirmations (or 2 of the course&apos;s panel) settle it; registration waits until then.</p>
      {!rows.length && <div className="card"><p className="small-note">No courses from other departments this term.</p></div>}
      {rows.map((r) => (
        <div key={r.courseId + r.term} className="card" style={{ borderLeft: `5px solid ${r.status === "CONFIRMED" ? "#2E7D32" : "#B3261E"}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <b>{r.code} {r.title} <span className="small-note">· {r.batchLabel}</span></b>
            <span style={{ fontSize: 12.5 }}>GA for {r.term || "this term"}: <b style={{ color: r.status === "CONFIRMED" ? "#2E7D32" : "#B3261E" }}>{r.status === "CONFIRMED" ? "confirmed" : "waiting"}</b>{r.votes.length ? ` · ${r.votes.map((v) => v.userName).join(", ")}` : ""}</span>
          </div>
          <p className="small-note" style={{ margin: "4px 0" }}>Home: {r.homeDept}{r.mode === "LINKED" ? ` · same as ${r.homeCourse} (${r.theirProgram})` : r.mode === "PLANNED_FOR_PROGRAM" ? ` · planned for ${r.ourProgram} — the SE maps CLOs straight to our GAs` : " · not linked to a home course yet (set it in the batch's home-department step)"} · suggested from {r.from}</p>
          <p style={{ fontSize: 12.5, margin: "4px 0" }}>CLOs reach (translated): {r.reached.length ? r.reached.map((id) => ga(r, id)).join(", ") : "none"}
            {r.mismatchChosen.length > 0 && <span style={{ color: "#B3261E" }}> · ⚑ chosen but no CLO reaches it: {r.mismatchChosen.map((id) => ga(r, id)).join(", ")}</span>}
            {r.mismatchExtra.length > 0 && <span style={{ color: "#C98A0B" }}> · reached but not chosen: {r.mismatchExtra.map((id) => ga(r, id)).join(", ")}</span>}</p>
          {r.plos.length ? <ActionForm url="/api/omc/ga-crosswalk" fixed={{ action: "confirmGa", courseId: r.courseId, term: r.term }} submit={r.status === "CONFIRMED" ? "Change and confirm again" : "Confirm these GAs"} showMessage
            initial={Object.fromEntries(r.suggested.map((id) => [`ga_${id}`, true]))}
            fields={r.plos.map((p) => ({ name: `ga_${p.id}`, label: `GA${p.number} ${p.title}`, type: "checkbox" as const }))} /> : <p className="small-note">The batch has no GAs yet.</p>}
        </div>
      ))}
    </Shell>
  );
}
