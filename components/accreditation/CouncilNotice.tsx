import Link from "next/link";
import { BODIES, type BodyKey } from "../../lib/accreditation/bodies";

/** Shown instead of another council's forms: a program only ever sees its own council's. */
export default function CouncilNotice({ program, body, explicit, departmentId, form }: { program: string; body: BodyKey; explicit: boolean; departmentId: string | null; form: string }) {
  return (
    <div className="card" style={{ borderLeft: "4px solid var(--brass)" }}>
      <h2 style={{ fontSize: 17, margin: "0 0 6px" }}>{program} is accredited by {body}</h2>
      <p style={{ fontSize: 13.5, margin: "0 0 10px" }}>
        {program} is bound to the {BODIES[body].name}{explicit ? "" : " (inferred from the program's name — the Institute Head confirms it)"}, so the {form} doesn&apos;t apply to it.
        Its own council&apos;s forms are:
      </p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {body === "NBEAC" && departmentId && <Link href={`/accreditation/nbeac?dept=${departmentId}`} className="btn btn-brass btn-sm">NBEAC Self-Assessment Report</Link>}
        <Link href="/accreditation/readiness" className="btn btn-secondary btn-sm">{body} visit readiness</Link>
        <Link href="/accreditation/readiness/programs" className="btn btn-secondary btn-sm">Programs and councils</Link>
      </div>
    </div>
  );
}
