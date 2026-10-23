import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import Shell from "../../../../components/Shell";
import { navForRole } from "../../../../components/reportNav";
import { roleLabel } from "../../../../lib/reportScope";
import { aasContext } from "../../../../lib/aasAccess";
import { sectionRows } from "../../../../lib/aas";
import { selfFields, canonValues } from "../../../../lib/aasFields";
import { portalLists, buildRow, STUDENT_TEMPLATE, FACULTY_TEMPLATE } from "../../../../lib/nceacPortal";
import DetailsForm from "../../../../components/DetailsForm";

export const dynamic = "force-dynamic";

// Fix one student's or one teacher's NCEAC details from the NCEAC Portal Data page (Program Lead, HOD, Dean, head).
export default async function FixPortalDetails({ searchParams }: { searchParams: { kind?: string; id?: string; program?: string; back?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const kind = searchParams.kind === "staff" ? "staff" : "student";
  const id = String(searchParams.id || "");
  let program = searchParams.program || "";
  let batch: string | null = null;
  if (kind === "student") {
    const s = await prisma.student.findUnique({ where: { id }, select: { batchId: true, batch: { select: { degreeProgram: true } } } });
    if (s) { batch = s.batchId; program = s.batch.degreeProgram; }
  }
  const ctx = await aasContext(user, { program, batch });
  if (!ctx || !ctx.canEdit) redirect("/dashboard");
  // Back to where the Fix link was: the NCEAC page (a query string) or another OBEHUB page such as /hemis (a path only).
  const bk = searchParams.back || "";
  const back = bk.startsWith("?") ? `/accreditation/nceac-portal${bk}` : /^\/[a-z][\w/-]*$/.test(bk) ? bk : `/accreditation/nceac-portal?program=${encodeURIComponent(ctx.program)}`;
  const lists = await portalLists(ctx.chairmanId);
  // Any program of the institute (HEMIS covers every program, not only the NCEAC ones); a Program Lead only their own batches.
  const mine = kind === "student" && batch ? await prisma.batch.findFirst({ where: { id: batch, coordinator: { managedById: ctx.chairmanId }, ...(user.role === "PROGRAM_COORDINATOR" ? { coordinatorId: user.id } : {}) }, select: { id: true } }) : null;
  const rows = kind === "student" ? (mine ? await sectionRows("students", { ...ctx, program, batchId: batch }) : []) : await sectionRows("faculty", ctx);
  let row = kind === "student" ? null : rows.find((r) => r.ref === id) || null;
  if (kind === "student") { const s = await prisma.student.findUnique({ where: { id }, select: { rollNumber: true } }); row = rows.find((r) => r.ref === s?.rollNumber) || null; }
  const shell = (x: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}><p className="no-print" style={{ margin: "0 0 6px" }}><a href={back}>← {back.startsWith("/hemis") ? "HEMIS Data Export" : "NCEAC Portal Data"}</a></p>{x}</Shell>;
  if (!row) return shell(<div className="card">This {kind === "student" ? "student" : "teacher"} is not in your programs.</div>);
  const values = canonValues(kind, row.values, lists);
  const check = buildRow(kind === "student" ? STUDENT_TEMPLATE : FACULTY_TEMPLATE, { ...values, roll: row.ref }, lists, row.ref, id);
  return shell(<>
    <h1 style={{ fontSize: 22, marginBottom: 4 }}>Details for NCEAC and HEMIS — {row.values.name}</h1>
    <p className="small-note">{kind === "student" ? `Roll number ${row.ref} · ${ctx.program}` : "Faculty"} · values from OBEHUB are filled in; anything you type here is kept with the {kind === "student" ? "student's" : "teacher's"} record and goes into the portal files.</p>
    {check.issues.length > 0 && <div className="card" style={{ borderLeft: "5px solid #B3261E" }}><b>Still to fix</b><ul style={{ margin: "6px 0 0 18px", padding: 0, fontSize: 13 }}>{check.issues.map((i, n) => <li key={n}><b>{i.col}</b>: {i.problem}{i.severity === "check" ? " (please check)" : ""}</li>)}</ul></div>}
    <div className="card"><DetailsForm fields={selfFields(kind, lists)} values={values} endpoint={`/api/accreditation/nceac-portal?fix=1`} extra={{ action: "detail", kind, id, program: ctx.program, batch: batch || "" }} note="Dropdowns list the portal's own choices. Dates as dd/mm/yyyy; CNIC as xxxxx-xxxxxxx-x." /></div>
  </>);
}
