import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { navForRole } from "../../components/reportNav";
import Shell from "../../components/Shell";
import OutcomesForm from "../../components/OutcomesForm";
import RemoveButton from "../../components/RemoveButton";

const KINDS: Record<string, string> = { STUDENT: "Student satisfaction", EXIT: "Graduating student exit", ALUMNI: "Alumni", EMPLOYER: "Employer", COURSE: "Course evaluation" };
const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const pc = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

export default async function OutcomesPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");
  const [figs, surveys] = (await Promise.all([
    prisma.outcomeFigure.findMany({ where: { leadId: user.id } as never, orderBy: { intakeYear: "desc" } }),
    prisma.surveyResult.findMany({ where: { leadId: user.id } as never, orderBy: { surveyDate: "desc" }, take: 60 }),
  ])) as unknown as [{ id: string; intakeYear: number; admitted: number; graduated: number; graduatedOnTime: number; droppedOut: number; employedOrStudying: number | null; notes: string | null }[], { id: string; kind: string; surveyDate: Date; respondents: number; invited: number | null; avgRating: number | null; findings: string | null; actionTaken: string | null }[]];
  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Graduation figures and surveys</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>NCEAC asks how many students were admitted, how many graduated and in how long, how many left, and what students, graduates, alumni and employers said. These feed Criterion 4 of the readiness report.</p>
      <OutcomesForm mode="FIGURES" />
      <div className="card" style={{ marginBottom: 18, overflowX: "auto" }}>
        {figs.length === 0 ? <p style={{ color: "var(--slate)", margin: 0 }}>No figures yet.</p> : (
          <table><thead><tr><th>Intake year</th><th>Admitted</th><th>Graduated</th><th>On time</th><th>Dropped out</th><th>Graduation rate</th><th>Dropout rate</th><th>Employed or studying</th><th></th></tr></thead>
            <tbody>{figs.map((f) => <tr key={f.id}><td><b>{f.intakeYear}</b></td><td>{f.admitted}</td><td>{f.graduated}</td><td>{f.graduatedOnTime}</td><td>{f.droppedOut}</td><td>{pc(f.graduated, f.admitted)}</td><td>{pc(f.droppedOut, f.admitted)}</td><td>{f.employedOrStudying ?? "—"}</td><td><RemoveButton url={`/api/outcomes?type=FIGURES&id=${f.id}`} confirmText="Remove this year?" /></td></tr>)}</tbody></table>
        )}
      </div>
      <OutcomesForm mode="SURVEY" kinds={KINDS} />
      <div className="card">
        {surveys.length === 0 ? <p style={{ color: "var(--slate)", margin: 0 }}>No surveys yet.</p> : surveys.map((s) => (
          <div key={s.id} style={{ borderTop: "1px solid var(--line)", padding: "8px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}><b>{KINDS[s.kind]} survey · {day(s.surveyDate)}</b><span style={{ fontSize: 12.5 }}>{s.respondents}{s.invited ? ` of ${s.invited} (${pc(s.respondents, s.invited)})` : ""} responded{s.avgRating !== null ? ` · average ${s.avgRating}/5` : ""}</span></div>
            {s.findings && <div style={{ fontSize: 12.5 }}><b>Found:</b> {s.findings}</div>}
            {s.actionTaken && <div style={{ fontSize: 12.5 }}><b>Action:</b> {s.actionTaken}</div>}
            <RemoveButton url={`/api/outcomes?type=SURVEY&id=${s.id}`} confirmText="Remove this survey?" />
          </div>
        ))}
      </div>
    </Shell>
  );
}
