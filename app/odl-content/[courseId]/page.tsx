import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import { ModuleRow, SignOff } from "../../../components/OdlContent";
import * as T from "../../../lib/teachingTools";

export const dynamic = "force-dynamic";
export const metadata = { title: "ODL content" };

// ODL content per lecture topic (HEC ODL Part-II 7.iv–7.vi): the Subject Expert and the Instructional Designer build each
// module, then both sign the content off. Changing a module afterwards asks for a fresh review.
export default async function OdlContentPage({ params, searchParams }: { params: { courseId: string }; searchParams: { prog?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const ctx = await T.courseCtx(params.courseId);
  if (!ctx) notFound();
  const acc = await T.contentAccess(user, ctx);
  if (!acc) notFound();
  const [mods, designer, bank] = await Promise.all([T.modulesOf(ctx.id), T.designerFor(ctx), prisma.questionBankItem.groupBy({ by: ["cloCode"], where: { chairmanId: ctx.chairmanId, courseCode: ctx.code, active: true }, _count: true }).catch(() => [])]);
  const bankOf = new Map((bank as { cloCode: string; _count: number }[]).map((b) => [b.cloCode, b._count]));
  const ready = mods ? mods.lectures.filter((l) => l.m && (l.m.videoUrl || l.m.readingUrl) && l.m.selfQ > 0).length : 0;
  const recorded = mods ? mods.lectures.reduce((a, l) => a + (l.m?.videoMin || 0), 0) : 0;
  const d = (x: Date | null | undefined) => (x ? new Date(x).toISOString().slice(0, 10) : null);
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div className="small-note">{searchParams.prog ? <Link href={`/collab?id=${searchParams.prog}&step=2`}>ODL programme</Link> : "ODL"} › {ctx.code}</div>
      <h1 style={{ fontSize: 22, margin: "2px 0 4px" }}>{ctx.code} — {ctx.title}: ODL content</h1>
      <p className="small-note" style={{ marginTop: 0 }}>One module per lecture topic of the Subject Expert&apos;s plan: enough explanation, activities, self-assessment questions, links to further reading and references (HEC ODL 7.v). Recorded content is in general best under 30 minutes (7.iv.h). Instructional Designer: {designer?.name || "not named on the ODL programme yet"}. <Link href={`/course-tools/${ctx.id}`}>Teaching tools</Link></p>
      {!mods ? <div className="card" style={{ fontSize: 13 }}>{T.TOOLS_HINT}</div> : <>
        <div className="card" style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}><span><b>{ready}</b> of {mods.lectures.length} modules ready</span><span><b>{Math.round(recorded)}</b> recorded minutes</span>
          <SignOff courseId={ctx.id} as="SE" label="Subject Expert" done={mods.review?.seAt ? `${mods.review.seName} ${d(mods.review.seAt)}` : null} can={user.id === ctx.subjectExpertId} />
          <SignOff courseId={ctx.id} as="ID" label="Instructional Designer" done={mods.review?.idAt ? `${mods.review.idName} ${d(mods.review.idAt)}` : null} can={!!designer && user.id === designer.id} /></div>
        {!mods.lectures.length ? <p className="small-note">The Subject Expert&apos;s lecture plan has no topics yet.</p> :
          <div style={{ overflowX: "auto" }}><table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>#</th><th>Week</th><th>Topic</th><th>Video</th><th>Self-check Qs</th><th>Reading</th><th>Status</th><th /></tr></thead>
            <tbody>{mods.lectures.map((l) => <ModuleRow key={l.n} courseId={ctx.id} n={l.n} week={l.week} topic={l.topic} clo={l.clo} canAct={acc === "act"} bankQ={l.clo ? bankOf.get(l.clo) || 0 : 0} m={l.m ? { videoUrl: l.m.videoUrl, videoTitle: l.m.videoTitle, videoMin: l.m.videoMin, captions: l.m.captions, selfQ: l.m.selfQ, readingUrl: l.m.readingUrl, readingMin: l.m.readingMin, refs: l.m.refs, interaction: l.m.interaction } : null} />)}</tbody></table></div>}
      </>}
    </Shell>
  );
}
