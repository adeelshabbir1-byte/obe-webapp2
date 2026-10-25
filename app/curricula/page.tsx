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
export const metadata = { title: "Curricula" };
import CurriculaTabs from "../../components/CurriculaTabs";
import { canBuild } from "../../lib/curriculumBuilder";
import { adminCan } from "../../lib/platformTeam";

export default async function Curricula({ searchParams }: { searchParams: { show?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!LIB_ROLES.includes(user.role) && !(user.extraRoles || []).includes("CURRICULUM_BUILDER")) redirect("/home");
  let all = await libraryItems(user);
  // A Program Lead sees the curricula of their programs' discipline (BS CS → Computing), not every program's.
  if (user.role === "PROGRAM_COORDINATOR") {
    const { familyOf } = await import("../../lib/batchBoard");
    const fams = new Set((await prisma.batch.findMany({ where: { coordinatorId: user.id }, select: { degreeProgram: true }, distinct: ["degreeProgram"] })).map((b) => familyOf(b.degreeProgram)));
    if (fams.size) all = all.filter((i) => fams.has(familyOf(i.title)));
  }
  const show = searchParams.show === "university" ? "university" : searchParams.show === "national" ? "national" : null;
  const items = show === "national" ? all.filter((i) => i.kind === "National") : show === "university" ? all.filter((i) => i.kind !== "National") : all;
  const cid = user.role === "SUPER_USER" ? null : await findOwningChairmanId(user.id);
  const uni = cid ? await universityOf(cid) : null;
  const uniName = uni ? (await prisma.user.findUnique({ where: { id: uni }, select: { instituteName: true, name: true } })) : null;
  return (
    <Shell roleLabel={user.role === "SUPER_USER" ? "Super User" : roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <CurriculaTabs active={show === "university" ? "university" : "national"} showAdmin={await adminCan(user, "CURRICULUM")} showBuilder={await canBuild(user)} />
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>{show === "university" ? "University Curricula" : show === "national" ? "National Curricula" : "Curricula"}</h1>
      <p style={{ fontSize: 13, margin: "0 0 6px", fontWeight: 600 }}>{show === "university" ? "Curricula of universities: your own and, for an affiliated college, your university’s." : show === "national" ? "HEC and council curricula (NCEAC, NBEAC, PEC …) that every university builds on." : "National (HEC / council) and University curricula together."}</p>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>Every curriculum you can use, grouped by program, newest version first. Each has a standard code: <code>AUTHORITY-LEVEL-PROGRAM-YEAR</code> for official ones (e.g. NCEAC-BS-CS-2023) and the owner&apos;s short name for an institute&apos;s own (e.g. PU-BS-CS-2027).</p>
      {uniName && <div className="card" style={{ borderLeft: "5px solid #7A2E3B", fontSize: 13.5 }}>Your institute is affiliated to <b>{uniName.instituteName || uniName.name}</b>. Its curricula are listed as “Your university&apos;s”: import the version that applies from your batch&apos;s intake term; the scheme of studies, GAs and CLOs it sets cannot be changed here.</div>}
      <CurriculumLibrary canUse={user.role === "PROGRAM_COORDINATOR"} items={items} canTidy={["SUPER_USER", "CHAIRMAN", "DEAN", "OMC"].includes(user.role)} />
    </Shell>
  );
}
