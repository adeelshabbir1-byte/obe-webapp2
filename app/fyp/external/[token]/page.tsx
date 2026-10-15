import type { Metadata } from "next";
import { prisma } from "../../../../lib/db";
import { BRAND, sized } from "../../../../lib/brandAssets";
import { ScoreSheet } from "../../../../components/fyp/FypClient";
import { ARTIFACT_KINDS, externalByToken } from "../../../../lib/fyp";

export const dynamic = "force-dynamic";
// The link itself is the credential: keep it out of search engines and out of the Referer of outgoing links.
export const metadata: Metadata = { title: "FYP evaluation", robots: { index: false, follow: false }, referrer: "no-referrer" };
const day = (d: Date | null | undefined) => (d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—");

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "20px 16px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <img src={BRAND.wordmark.src} alt="OBEHUB" {...sized(BRAND.wordmark, 24)} />
        <span style={{ color: "var(--slate)", fontSize: 13 }}>Final Year Project evaluation</span>
      </div>
      {children}
    </main>
  );
}

// The external / industry evaluator's portal: opened from a private link, it shows only the groups on their panels
// and the rubric score sheets for them. No account is needed.
export default async function ExternalEvaluatorPage({ params }: { params: { token: string } }) {
  const ext = await externalByToken(params.token).catch(() => null);
  if (!ext) return <Frame><div className="card"><h2 style={{ marginTop: 0 }}>This link is not valid</h2><p style={{ margin: 0 }}>The evaluation link has expired or was replaced. Please ask the FYP Head for a new one.</p></div></Frame>;

  const cycle = await prisma.fypCycle.findUnique({ where: { id: ext.cycleId } });
  const seats = await prisma.fypPanelMember.findMany({ where: { externalId: ext.id } });
  const panels = await prisma.fypPanel.findMany({ where: { id: { in: seats.map((s) => s.panelId).concat(["none"]) } }, orderBy: { sessionAt: "asc" } });
  const groups = await prisma.fypGroup.findMany({ where: { panelId: { in: panels.map((p) => p.id).concat(["none"]) }, status: { in: ["ACTIVE", "COMPLETED"] } }, orderBy: { name: "asc" } });
  const gids = groups.map((g) => g.id).concat(["none"]);
  const [members, proposals, milestones, criteria, scores, evaluations, artifacts] = await Promise.all([
    prisma.fypGroupMember.findMany({ where: { groupId: { in: gids }, status: "JOINED" } }),
    prisma.fypProposal.findMany({ where: { id: { in: groups.map((g) => g.proposalId).filter((x): x is string => !!x).concat(["none"]) } } }),
    prisma.fypMilestone.findMany({ where: { cycleId: ext.cycleId, weightPct: { gt: 0 } }, orderBy: [{ orderIndex: "asc" }, { dueDate: "asc" }] }),
    prisma.fypRubricCriterion.findMany({ where: { cycleId: ext.cycleId }, orderBy: { orderIndex: "asc" } }),
    prisma.fypScore.findMany({ where: { groupId: { in: gids }, evaluatorKey: `ext:${ext.id}` } }),
    prisma.fypEvaluation.findMany({ where: { groupId: { in: gids }, evaluatorKey: `ext:${ext.id}` } }),
    prisma.fypArtifact.findMany({ where: { groupId: { in: gids }, kind: { in: ["THESIS_DRAFT", "REPOSITORY", "DEMO_VIDEO"] } }, orderBy: { createdAt: "desc" } }),
  ]);
  const students = new Map((await prisma.student.findMany({ where: { id: { in: members.map((m) => m.studentId).concat(["none"]) } }, select: { id: true, name: true, rollNumber: true } })).map((s) => [s.id, s]));
  const proposalOf = new Map(proposals.map((p) => [p.id, p]));
  const crit = criteria.map((c) => ({ id: c.id, name: c.name, description: c.description, bloomLevel: c.bloomLevel, ploNumber: c.ploNumber, maxScore: c.maxScore, appliesTo: c.appliesTo }));
  const url = `/api/fyp/external/${params.token}`;

  return (
    <Frame>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Welcome, {ext.name}</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>
        {cycle?.title}. You are an external examiner on {panels.map((p) => `${p.name}${p.sessionAt ? ` (${p.sessionAt.toISOString().slice(0, 16).replace("T", " ")}${p.venue ? `, ${p.venue}` : ""})` : ""}`).join("; ") || "no panel yet"}.
        Score each group on the rubric and leave your feedback. You can come back and change your scores until {day(ext.expiresAt)}.
      </p>
      {groups.length === 0 && <div className="card"><p style={{ margin: 0 }}>No groups have been assigned to your panel yet.</p></div>}
      {groups.map((g) => {
        const p = g.proposalId ? proposalOf.get(g.proposalId) : null;
        const list = members.filter((m) => m.groupId === g.id).map((m) => students.get(m.studentId)).filter((s): s is { id: string; name: string; rollNumber: string } => !!s);
        const links = artifacts.filter((a) => a.groupId === g.id);
        return (
          <div key={g.id} className="card">
            <h2 style={{ fontSize: 18, margin: "0 0 4px" }}>{g.name}{p ? ` — ${p.title}` : ""}</h2>
            <p className="small-note" style={{ margin: 0 }}>{list.map((s) => `${s.name} (${s.rollNumber})`).join(", ")}{p?.domain ? ` · ${p.domain}` : ""}</p>
            {p?.abstract && <p style={{ fontSize: 13 }}>{p.abstract}</p>}
            {g.status === "COMPLETED" && <p className="small-note" style={{ color: "var(--sage)" }}>Results signed off — the scores below are final.</p>}
            {links.length > 0 && <p style={{ fontSize: 13 }}>{links.map((a, i) => <span key={a.id}>{i ? " · " : ""}<a href={a.url} target="_blank" rel="noopener noreferrer">{ARTIFACT_KINDS[a.kind]}</a></span>)}</p>}
            {list.length > 0 && milestones.map((m) => {
              const ev = evaluations.find((e) => e.groupId === g.id && e.milestoneId === m.id);
              return (
                <details key={m.id} style={{ borderTop: "1px solid var(--line)", padding: "8px 0" }} open={!ev && m === milestones[milestones.length - 1]}>
                  <summary style={{ cursor: "pointer", fontWeight: 700 }}>{m.title} {ev ? <span className="badge badge-ok">scored</span> : <span className="badge badge-warn">to do</span>}</summary>
                  <ScoreSheet url={url} groupId={g.id} milestoneId={m.id} roleText="External examiner" criteria={crit} members={list}
                    existing={Object.fromEntries(scores.filter((s) => s.groupId === g.id && s.milestoneId === m.id).map((s) => [`${s.criterionId}|${s.studentId}`, s.score]))}
                    comments={ev?.comments} recommendation={ev?.recommendation} readOnly={g.status === "COMPLETED"} />
                </details>
              );
            })}
          </div>
        );
      })}
    </Frame>
  );
}
