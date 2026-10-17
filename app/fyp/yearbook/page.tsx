import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { fypAccess } from "../../../lib/fyp";
import PrintButton from "../../../components/PrintButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "FYP Yearbook" };

// FYP Yearbook: a cover and one page per project — print or save as PDF.
export default async function YearbookPage({ searchParams }: { searchParams: { cycle?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const acc = await fypAccess(user);
  const cycle = await prisma.fypCycle.findFirst({ where: { id: searchParams.cycle || "", chairmanId: acc.chairmanId } });
  if (!cycle || !(acc.manages(cycle.departmentId) || acc.chairs(cycle.departmentId))) redirect("/fyp");
  const groups = await prisma.fypGroup.findMany({ where: { cycleId: cycle.id, status: { in: ["ACTIVE", "COMPLETED"] }, proposalId: { not: null } }, orderBy: { name: "asc" } });
  const [props, members, head] = await Promise.all([
    prisma.fypProposal.findMany({ where: { id: { in: groups.map((g) => g.proposalId as string) } } }),
    prisma.fypGroupMember.findMany({ where: { groupId: { in: groups.map((g) => g.id) }, status: "JOINED" } }),
    prisma.user.findUnique({ where: { id: acc.chairmanId }, select: { instituteName: true } }),
  ]);
  const [students, sups, dept] = await Promise.all([
    prisma.student.findMany({ where: { id: { in: members.map((m) => m.studentId) } }, select: { id: true, name: true, rollNumber: true } }),
    prisma.user.findMany({ where: { id: { in: groups.map((g) => g.supervisorId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }),
    prisma.department.findUnique({ where: { id: cycle.departmentId }, select: { name: true } }),
  ]);
  const page: React.CSSProperties = { background: "#fff", maxWidth: 800, margin: "0 auto 20px", padding: "40px 48px", pageBreakAfter: "always", fontFamily: "Georgia, serif", color: "#222" };
  return (
    <main style={{ background: "#EEE", minHeight: "100vh", padding: "10px 0" }}>
      <style>{"@media print { main { background: #fff !important; padding: 0 !important } @page { size: A4; margin: 12mm } }"}</style>
      <div className="no-print" style={{ textAlign: "center", margin: 10 }}><PrintButton /></div>
      <section style={{ ...page, textAlign: "center", paddingTop: 180 }}>
        <div style={{ fontSize: 16, color: "#555" }}>{head?.instituteName || ""}</div>
        <h1 style={{ fontSize: 38, margin: "12px 0", fontFamily: "inherit" }}>Final Year Projects</h1>
        <div style={{ fontSize: 18 }}>{dept?.name} · {cycle.title}</div>
        <div style={{ marginTop: 40, fontSize: 14, color: "#555" }}>{groups.length} projects</div>
      </section>
      {groups.map((g) => { const p = props.find((x) => x.id === g.proposalId)!; const team = members.filter((m) => m.groupId === g.id).map((m) => students.find((s) => s.id === m.studentId)).filter(Boolean); return (
        <section key={g.id} style={page}>
          <div style={{ fontSize: 12, color: "#7A520C", textTransform: "uppercase", letterSpacing: ".08em" }}>{p.domain || "Project"}</div>
          <h2 style={{ fontSize: 24, margin: "4px 0 10px", fontFamily: "inherit" }}>{p.title}</h2>
          <div style={{ fontSize: 13 }}><b>Team:</b> {team.map((s) => `${s!.name} (${s!.rollNumber})`).join(", ")}</div>
          <div style={{ fontSize: 13 }}><b>Supervisor:</b> {sups.find((s) => s.id === g.supervisorId)?.name || "—"}</div>
          {(g.publicationFlag || g.patentFlag || g.incubatorFlag) && <div style={{ fontSize: 13, color: "#1F5E36" }}><b>Highlights:</b> {[g.publicationFlag && "Research publication", g.patentFlag && "Patent filing", g.incubatorFlag && "Incubator / commercial"].filter(Boolean).join(" · ")}</div>}
          <h3 style={{ fontSize: 14, margin: "14px 0 4px" }}>Abstract</h3>
          <p style={{ fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{p.abstract}</p>
          {p.outcomes && <><h3 style={{ fontSize: 14, margin: "10px 0 4px" }}>Outcomes</h3><p style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{p.outcomes}</p></>}
        </section>); })}
    </main>
  );
}
