import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../../lib/session";
import { navForRole } from "../../../../components/reportNav";
import { roleLabel } from "../../../../lib/reportScope";
import Shell from "../../../../components/Shell";
import { prisma } from "../../../../lib/db";
import BuilderBoard from "../../../../components/builder/BuilderBoard";
import { canBuild, loadBoard, BUILDER_HINT } from "../../../../lib/curriculumBuilder";
import { TEMPLATES, normTitle } from "../../../../lib/curriculumTemplates";
import { hasContentPack } from "../../../../lib/curriculumContent";

export const dynamic = "force-dynamic";
export const metadata = { title: "Curriculum Builder" };

export default async function BuilderPage({ params, searchParams }: { params: { id: string }; searchParams: { step?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const b = await loadBoard(params.id).catch(() => null);
  const shell = (x: React.ReactNode) => <Shell roleLabel={user.role === "SUPER_USER" ? "Super User" : roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>{x}</Shell>;
  if (b === null) {
    const exists = await prisma.masterCurriculum.count({ where: { id: params.id } });
    if (!exists) notFound();
    return shell(<div className="err">{BUILDER_HINT}</div>);
  }
  if (!(await canBuild(user, { chairmanId: b.curriculum.chairmanId, authority: b.curriculum.authority, title: b.curriculum.title }))) redirect(`/curricula/${params.id}`);
  const older = await prisma.masterCurriculum.findMany({ where: { id: { not: b.curriculum.id }, title: b.curriculum.title, chairmanId: b.curriculum.chairmanId, status: "PUBLISHED" }, select: { id: true, authority: true, version: true } });
  const canPublish = user.role === "SUPER_USER" || b.curriculum.chairmanId !== null;
  return shell(
    <>
      <p className="small-note" style={{ margin: "0 0 6px" }}><Link href="/curricula/builder">← Curriculum Builder</Link> · <Link href={`/curricula/${b.curriculum.id}`}>Library view</Link>{user.role === "SUPER_USER" && <> · <Link href={`/admin/curricula/${b.curriculum.id}`}>CLOs, topics and GAs (full editor)</Link></>}</p>
      <BuilderBoard canEdit cur={b.curriculum} types={b.types} tracks={b.tracks} courses={b.courses} step={searchParams.step || ""} canPublish={canPublish}
        templates={TEMPLATES.map((t) => ({ key: t.key, label: `${t.council} ${t.version} — ${t.program}` }))} older={older.map((o) => ({ id: o.id, label: `${o.authority} ${o.version}` }))}
        packs={TEMPLATES.filter((t) => hasContentPack(t.key) && normTitle(t.program) === normTitle(b.curriculum.title)).map((t) => ({ key: t.key, label: `${t.council} ${t.version}` }))} />
    </>
  );
}
