import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import CurriculumTidy from "../../../components/CurriculumTidy";
import { libraryItems } from "../../../lib/curriculumLibraryData";
import { LEVELS, DISCIPLINES } from "../../../lib/curriculumLibrary";
import { findOwningChairmanId } from "../../../lib/institutionCurriculum";

export const dynamic = "force-dynamic";
export const metadata = { title: "Name curricula" };

export default async function Tidy() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!["SUPER_USER", "CHAIRMAN", "DEAN", "OMC"].includes(user.role)) redirect("/curricula");
  const own = user.role === "SUPER_USER" ? null : await findOwningChairmanId(user.id);
  // The Super User names the official curricula; an institute names its own.
  const items = (await libraryItems(user)).filter((i) => (user.role === "SUPER_USER" ? !i.chairmanId : i.chairmanId === own));
  return (
    <Shell roleLabel={user.role === "SUPER_USER" ? "Super User" : roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <p className="small-note" style={{ margin: 0 }}><Link href="/curricula">← Curriculum Library</Link></p>
      <h1 style={{ fontSize: 22, margin: "4px 0" }}>Name &amp; tidy up curricula</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>Each curriculum gets a standard code — <code>AUTHORITY-LEVEL-PROGRAM-YEAR</code> (NCEAC-BS-CS-2023, HEC-BS-AI-2025, NBEAC-BBA-2024; an institute&apos;s own: PU-BS-CS-2027) — and the fields the library filters by. The proposals below are read from each title, authority and version; correct any cell, then apply. Titles are not changed, and batches that already use a curriculum are not affected. Red rows share a code: usually the same curriculum uploaded twice — open both in the library, keep one and mark the other Superseded.</p>
      {items.length ? <CurriculumTidy rows={items.map((i) => ({ id: i.id, oldName: `${i.authority} · ${i.title} · ${i.version}`, owner: i.owner, named: i.named, code: i.code, level: i.level, programCode: i.programCode, programName: i.programName, discipline: i.discipline, dup: false }))} levels={LEVELS.map(([l]) => l)} disciplines={DISCIPLINES} />
        : <div className="card small-note">No curricula to name.</div>}
    </Shell>
  );
}
