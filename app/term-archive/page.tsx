import { redirect } from "next/navigation";
import { prisma } from "../../lib/db";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { chairmanIdFor, roleLabel } from "../../lib/reportScope";
import { termsOverview } from "../../lib/termArchive";
import { ArchiveTerm, Decide, RequestAmendment } from "./ArchiveButtons";

export const dynamic = "force-dynamic";

// End-of-term archive (Adeel prompt §10): terms with their approved results, "Archive this term", and amendments.
export default async function TermArchivePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const controller = ((user as { extraRoles?: string[] }).extraRoles || []).includes("EXAM_CONTROLLER");
  const leader = ["CHAIRMAN", "HEAD_OF_DEPARTMENT", "DEAN"].includes(user.role) || controller;
  const cid = await chairmanIdFor(user as never);
  const db = prisma as unknown as Record<string, any>;
  const terms = await termsOverview(cid);
  const archived = ((await db.termArchive?.findMany({ where: { chairmanId: cid }, select: { courseId: true, term: true } }).catch(() => [])) || []) as { courseId: string; term: string }[];
  const mineIds = leader ? archived.map((a) => a.courseId) : (await prisma.course.findMany({ where: { id: { in: archived.map((a) => a.courseId).concat("none") }, OR: [{ instructorId: user.id }, { coordinatorId: user.id }] }, select: { id: true } })).map((c) => c.id);
  const courses = await prisma.course.findMany({ where: { id: { in: mineIds.concat("none") } }, select: { id: true, code: true, title: true, offeredTermName: true, offeredTermYear: true } });
  const pending = leader ? ((await db.archiveAmendment?.findMany({ where: { status: "PENDING", courseId: { in: archived.map((a) => a.courseId).concat("none") } }, orderBy: { createdAt: "desc" } }).catch(() => [])) || []) as { id: string; courseId: string; term: string; reason: string; requestedById: string }[] : [];
  const who = new Map((await prisma.user.findMany({ where: { id: { in: pending.map((p) => p.requestedById).concat("none") } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const code = new Map((await prisma.course.findMany({ where: { id: { in: pending.map((p) => p.courseId).concat("none") } }, select: { id: true, code: true } })).map((c) => [c.id, c.code]));
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1>Term archive</h1>
      <p className="small-note">When a term&apos;s results are approved, archive it: each course is saved as a read-only snapshot (plan, CLOs, assessments, marks, attainment inputs, CQI, timetable), and past evidence can&apos;t change by later edits. A correction needs an amendment approved by the Controller or HOD; both versions are kept.</p>
      {leader && <div className="card" style={{ marginBottom: 12 }}>
        <table className="table" style={{ fontSize: 13, width: "100%" }}><thead><tr><th style={{ textAlign: "left" }}>Term</th><th>Courses</th><th>Results approved</th><th>Archived</th><th /></tr></thead>
          <tbody>{terms.map((t) => <tr key={t.term}><td>{t.term}</td><td style={{ textAlign: "center" }}>{t.courses}</td><td style={{ textAlign: "center" }}>{t.approved}</td><td style={{ textAlign: "center" }}>{t.archived}{t.at ? ` · ${new Date(t.at).toLocaleDateString("en-GB")}` : ""}</td>
            <td>{t.archived < t.approved && <ArchiveTerm term={t.term} ready={t.approved > 0} />}</td></tr>)}</tbody></table>
      </div>}
      {pending.length > 0 && <div className="card" style={{ marginBottom: 12 }}><h3 style={{ marginTop: 0, fontSize: 15 }}>Amendments waiting</h3>
        <ul style={{ paddingLeft: 18, fontSize: 13 }}>{pending.map((p) => <li key={p.id}>{String(code.get(p.courseId) || "")} ({p.term}) — {String(who.get(p.requestedById) || "")}: {p.reason} <Decide id={p.id} /></li>)}</ul></div>}
      {courses.length > 0 && <div className="card"><h3 style={{ marginTop: 0, fontSize: 15 }}>Correct an archived course</h3>
        <RequestAmendment courses={courses.map((c) => ({ id: c.id, label: `${c.code} ${c.title} (${c.offeredTermName} ${c.offeredTermYear})` }))} /></div>}
    </Shell>
  );
}
