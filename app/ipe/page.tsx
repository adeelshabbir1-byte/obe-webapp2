import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import QualityShell from "../../components/QualityShell";
import { ActionForm } from "../../components/fyp/FypClient";
import { qdb, QUALITY_HINT, IPE_STANDARDS, IPE_SCORES, ipeFacts, instituteOf } from "../../lib/quality";
import PrintButton from "../../components/PrintButton";
import { records, ACTION_FIELDS, canEditQa } from "../../lib/qaOffice";
import { formFields } from "../../lib/qaOptions";

export const dynamic = "force-dynamic";
const VIEW = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "OMC"];

// HEC Institutional Performance Evaluation: the institute's self-assessment against the 11 IPE standards.
export default async function IpePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const qec = (user.extraRoles || []).some((x) => x === "QEC_INCHARGE" || x === "QEC_MEMBER");
  if (!VIEW.includes(user.role) && !qec) redirect("/dashboard");
  const cid = await instituteOf(user);
  const intro = "HEC's Institutional Performance Evaluation looks at the whole institute, not one program. Score each standard (4 fully met … 1 not met), write how the institute meets it, and list the evidence. Facts the system already holds are shown beside each standard. The standards follow the HEC IPE manual as we know it; check the wording against the current manual. Print this page for the IPE report.";
  const rows = ((await qdb.ipeScore.findMany({ where: { chairmanId: cid || "none" } }).catch(() => null)) as { standard: number; score: number | null; narrative: string | null; evidence: string | null; updatedAt: Date }[] | null);
  if (rows === null) return <QualityShell user={user} title="IPE Self-Assessment" intro={intro}><div className="err">{QUALITY_HINT}</div></QualityShell>;
  const facts = await ipeFacts(cid || "none");
  const edit = ["CHAIRMAN", "DEAN"].includes(user.role) || qec;
  const acts = (await records(cid || "none", "ACTION")) || [];
  const team = (await records(cid || "none", "QA_PROFILE"))?.[0]?.data.ipeTeam || "";
  const aw = ((await records(cid || "none", "AWARENESS")) || []);
  const { form: actionForm } = await formFields(user, cid || "none", ACTION_FIELDS);
  const canAct = canEditQa(user);
  const scored = rows.filter((r) => r.score);
  const avg = scored.length ? Math.round((100 * scored.reduce((s, r) => s + (r.score || 0), 0)) / scored.length) / 100 : null;
  const label = new Map(IPE_SCORES);
  return (
    <QualityShell user={user} title="IPE Self-Assessment" intro={intro}>
      <div className="card no-print" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span><b>{scored.length}</b> of {IPE_STANDARDS.length} standards scored{avg != null && <> · average <b>{avg}</b> / 4</>}</span>
        <PrintButton />
      </div>
      <div className="card" style={{ fontSize: 13 }}><b>Self-assessment team:</b> {team ? <span style={{ whiteSpace: "pre-wrap" }}>{"\n"}{team}</span> : <span className="small-note">not named yet — add it under Quality Office → The office.</span>}
        <div className="small-note" style={{ marginTop: 4 }}>Quality awareness: {aw.length} session(s), {aw.reduce((s, r) => s + (Number(r.data.attendees) || 0), 0)} attendees (Quality Office → Awareness sessions).</div></div>
      {IPE_STANDARDS.map(([n, title, about]) => {
        const r = rows.find((x) => x.standard === n);
        const c = !r?.score ? "#6B7177" : r.score >= 3 ? "#2E7D4F" : r.score === 2 ? "#B7791F" : "#B3261E";
        return (
          <div key={n} className="card" style={{ borderLeft: `4px solid ${c}` }}>
            <h3 style={{ margin: "0 0 2px" }}>Standard {n}: {title} <span style={{ color: c, fontSize: 14 }}>{r?.score ? `${r.score} — ${label.get(r.score)}` : "not scored"}</span></h3>
            <p className="small-note" style={{ marginTop: 0 }}>{about}{facts[n] ? ` System: ${facts[n]}` : ""}</p>
            {r?.narrative && <p style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{r.narrative}</p>}
            {r?.evidence && <p style={{ fontSize: 12.5, whiteSpace: "pre-wrap" }}><b>Evidence:</b> {r.evidence}</p>}
            {edit && <div className="no-print"><ActionForm url="/api/quality" fixed={{ action: "ipe", standard: n }} submit="Save" collapsed openLabel={r ? "Edit" : "Assess this standard"} initial={{ score: r?.score ? String(r.score) : "", narrative: r?.narrative || "", evidence: r?.evidence || "" }}
              fields={[{ name: "score", label: "Score", type: "select", options: [["", "—"], ...IPE_SCORES.map(([v, l]) => [String(v), `${v} ${l}`] as [string, string])] }, { name: "narrative", label: "How the institute meets this standard", type: "textarea", full: true }, { name: "evidence", label: "Evidence (documents, links, minutes)", type: "textarea", full: true }]} /></div>}
            {(() => { const mine = acts.filter((a) => a.refId === `IPE-${n}`); return (mine.length > 0 || canAct) && (
              <div style={{ marginTop: 6 }}><b style={{ fontSize: 13 }}>Action plan</b>
                {mine.length > 0 && <table style={{ fontSize: 12.5 }}><tbody>{mine.map((a) => <tr key={a.id}><td>{a.data.action}</td><td>{a.data.owner}</td><td>{a.data.due}</td><td><b>{a.data.status || "Open"}</b></td><td className="no-print">{canAct && <ActionForm url="/api/qa-office" fixed={{ action: "save", kind: "ACTION", id: a.id }} fields={actionForm} initial={a.data} submit="Save" collapsed openLabel="Edit" />}</td></tr>)}</tbody></table>}
                {canAct && <div className="no-print"><ActionForm url="/api/qa-office" fixed={{ action: "save", kind: "ACTION", refId: `IPE-${n}` }} fields={actionForm} initial={{ status: "Open" }} submit="Add action" collapsed openLabel="+ Action" /></div>}
              </div>); })()}
          </div>
        );
      })}
    </QualityShell>
  );
}
