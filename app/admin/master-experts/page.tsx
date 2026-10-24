import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import PlatformExpertsManager from "../../../components/PlatformExpertsManager";
import { ADMIN_NAV } from "../../../components/adminNav";
import { ActionForm, ActionButton } from "../../../components/fyp/FypClient";
import { bdb } from "../../../lib/curriculumBuilder";
import { adminCan, adminNavFor, teamCurriculumWhere } from "../../../lib/platformTeam";

export default async function MasterExpertsPage({ searchParams }: { searchParams: { curriculumId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!(await adminCan(user, "CURRICULUM"))) redirect("/dashboard");
  const adminNav = await adminNavFor(user);

  const [experts, curricula] = await Promise.all([
    prisma.user.findMany({ where: { role: "SUBJECT_EXPERT", isPlatformExpert: true }, orderBy: { createdAt: "desc" } }),
    prisma.masterCurriculum.findMany({ where: { chairmanId: null, ...(await teamCurriculumWhere(user)) }, orderBy: [{ title: "asc" }, { version: "desc" }] }),
  ]);
  const scopes = ((await bdb.curriculumBuilderScope.findMany({}).catch(() => [])) as { userId: string; councilsJson: string; programsJson: string }[]);
  const sc = new Map(scopes.map((s) => [s.userId, s]));
  const j = (s?: string) => { try { return (JSON.parse(s || "[]") as string[]).join(", "); } catch { return ""; } };
  const curriculumId = searchParams.curriculumId || curricula[0]?.id || "";
  const courses = curriculumId ? await prisma.masterCourse.findMany({ where: { masterCurriculumId: curriculumId }, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }] }) : [];

  return (
    <Shell roleLabel="Super User" userName={user.name} navLinks={adminNav}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>National Subject Experts</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        A National Subject Expert is a University Subject Expert one level up: a platform account (no institute) who designs one course of the national curriculum — CLOs and GA mapping, outline, books, lecture plan, assessments — for every university. Create them here, assign each national course to one, and put them in a national curriculum team on the <a href="/admin/team">Platform Team</a> page.
      </p>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Curriculum Builders</h3>
        <p className="small-note" style={{ marginTop: 0 }}>A Curriculum Builder is a curriculum-committee member (later: HEC&apos;s own experts) who builds the <b>structure</b> of official curricula in the <a href="/curricula/builder">Curriculum Builder</a> — course types, placing courses, elective tracks — and submits them for you to publish. Limit each to councils (e.g. NCEAC) and programs, or leave empty for all. Subject Experts below still write each course&apos;s CLOs and topics.</p>
        <table style={{ fontSize: 13 }}><thead><tr><th>Expert</th><th>Builder?</th><th>Councils / programs</th><th></th></tr></thead>
          <tbody>{experts.map((e) => { const s = sc.get(e.id); return (
            <tr key={e.id}><td>{e.name}</td><td>{s ? <b style={{ color: "#2E7D32" }}>Yes</b> : "No"}</td><td className="small-note">{s ? `${j(s.councilsJson) || "all councils"} · ${j(s.programsJson) || "all programs"}` : "—"}</td>
              <td><ActionForm url="/api/admin/curriculum-builders" fixed={{ userId: e.id, on: true }} fields={[{ name: "councils", label: "Councils (comma separated)" }, { name: "programs", label: "Programs (comma separated)" }]} initial={{ councils: j(s?.councilsJson), programs: j(s?.programsJson) }} submit={s ? "Save scope" : "Make Curriculum Builder"} collapsed openLabel={s ? "Edit scope" : "Make builder"} />
                {s && <ActionButton url="/api/admin/curriculum-builders" body={{ userId: e.id, on: false }} label="Remove" className="btn btn-secondary btn-sm" />}</td></tr>); })}</tbody></table>
      </div>
      <PlatformExpertsManager
        experts={experts.map((e) => ({ id: e.id, name: e.name, username: e.username, organization: e.organization }))}
        curricula={curricula.map((c) => ({ id: c.id, label: `${c.title} (${c.version})` }))}
        curriculumId={curriculumId}
        courses={courses.map((c) => ({ id: c.id, code: c.code, title: c.title, semesterNumber: c.semesterNumber, designerId: c.designerId }))}
      />
    </Shell>
  );
}
