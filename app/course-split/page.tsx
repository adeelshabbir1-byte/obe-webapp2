import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { loadSplit } from "../../lib/courseSplit";
import Shell from "../../components/Shell";
import CourseSplitManager from "../../components/CourseSplitManager";

export default async function CourseSplitPage({ searchParams }: { searchParams: { departmentId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "HEAD_OF_DEPARTMENT" && user.role !== "CHAIRMAN") redirect("/dashboard");

  const isHead = user.role === "CHAIRMAN";
  const departments = isHead ? await prisma.department.findMany({ where: { chairmanId: user.id }, orderBy: { name: "asc" } }) : [];
  const departmentId = isHead ? (departments.find((d) => d.id === searchParams.departmentId)?.id || departments[0]?.id || null) : user.departmentId || null;
  const chairmanId = isHead ? user.id : user.managedById || "";
  const data = departmentId ? await loadSplit(chairmanId, departmentId, isHead ? null : departmentId) : null;

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Course Split</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Many courses are common to several programs. Give each common course to <strong>one</strong> Program Lead; he assigns the Subject Expert for that course in every program that teaches it.
        A specialised course, taught in one program only, stays with that program's lead unless you choose another. Course Assigners still assign the teachers.
        A course can also go to a lead of another department (Maths, English, Management...); that department's Chairman must accept it first.
      </p>
      {isHead && departments.length > 1 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {departments.map((d) => <Link key={d.id} href={`/course-split?departmentId=${d.id}`} className="btn" style={{ textDecoration: "none", fontWeight: d.id === departmentId ? 700 : 400 }}>{d.name}</Link>)}
        </div>
      )}
      {data ? <CourseSplitManager key={departmentId} data={data} departmentId={isHead ? departmentId : null} /> : <div className="card"><p style={{ fontSize: 13 }}>No department found. Create departments first.</p></div>}
    </Shell>
  );
}
