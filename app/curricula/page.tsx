import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import Shell from "../../components/Shell";
import CurriculumLibrary from "../../components/CurriculumLibrary";
import { libraryItems, LIB_ROLES } from "../../lib/curriculumLibraryData";
import { universityOf } from "../../lib/curriculumLibrary";
import { findOwningChairmanId } from "../../lib/institutionCurriculum";
import { prisma } from "../../lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Curriculum Library" };

export default async function Curricula() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!LIB_ROLES.includes(user.role) && !(user.extraRoles || []).includes("CURRICULUM_BUILDER")) redirect("/home");
  const items = await libraryItems(user);
  const cid = user.role === "SUPER_USER" ? null : await findOwningChairmanId(user.id);
  const uni = cid ? await universityOf(cid) : null;
  const uniName = uni ? (await prisma.user.findUnique({ where: { id: uni }, select: { instituteName: true, name: true } })) : null;
  return (
    <Shell roleLabel={user.role === "SUPER_USER" ? "Super User" : roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Curriculum Library</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>Every curriculum you can use, grouped by program, newest version first. Each has a standard code: <code>AUTHORITY-LEVEL-PROGRAM-YEAR</code> for official ones (e.g. NCEAC-BS-CS-2023) and the owner&apos;s short name for an institute&apos;s own (e.g. PU-BS-CS-2027).</p>
      {uniName && <div className="card" style={{ borderLeft: "5px solid #7A2E3B", fontSize: 13.5 }}>Your institute is affiliated to <b>{uniName.instituteName || uniName.name}</b>. Its curricula are listed as “Your university&apos;s”: import the version that applies from your batch&apos;s intake term; the scheme of studies, GAs and CLOs it sets cannot be changed here.</div>}
      <CurriculumLibrary items={items} canTidy={["SUPER_USER", "CHAIRMAN", "DEAN", "OMC"].includes(user.role)} />
    </Shell>
  );
}
