import { courseBreaches } from "../lib/assessmentRules";

/** On the assessment plan pages: the OMC's rules this plan breaks, and whether each is approved. */
export default async function AssessmentRuleBanner({ courseId, source }: { courseId: string; source: "SE" | "INSTRUCTOR" }) {
  const b = await courseBreaches(courseId, source).catch(() => []);
  if (!b.length) return null;
  const open = b.filter((x) => x.status !== "APPROVED");
  return (
    <div className="err" style={{ background: open.length ? "#FFF1F0" : "#EAF4EE", color: open.length ? "#8A1C1C" : "#1F5E36" }}>
      <b>{open.length ? "Needs approval — this plan is outside the OMC's assessment rules:" : "Outside the OMC's rules, approved:"}</b>
      <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 13 }}>
        {b.map((x, i) => <li key={i}>{x.rule} — {x.scope}: {x.value}% (rule: {x.limit}) · <b>{x.status === "APPROVED" ? `approved${x.decidedBy ? ` by ${x.decidedBy}` : ""}` : x.status === "REJECTED" ? `not approved${x.decidedBy ? ` by ${x.decidedBy}` : ""}${x.note ? ` — ${x.note}` : ""}` : "waiting for the OMC or HOD"}</b></li>)}
      </ul>
    </div>
  );
}
