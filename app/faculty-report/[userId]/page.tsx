import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import PrintButton from "../../../components/PrintButton";
import { KINDS, REPORT_VIEWER_ROLES, completeness, reportPeople, yearsOfService } from "../../../lib/facultyProfile";

const day = (d?: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "—");

export default async function FacultyCvPage({ params }: { params: { userId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!REPORT_VIEWER_ROLES.includes(user.role)) redirect("/dashboard");

  const person = (await reportPeople(user)).find((p) => p.id === params.userId);
  if (!person) notFound();
  const [pr, records] = await Promise.all([
    prisma.facultyProfile.findUnique({ where: { userId: person.id } }),
    prisma.facultyRecord.findMany({ where: { userId: person.id }, orderBy: [{ startYear: "desc" }, { createdAt: "desc" }] }),
  ]);
  const yrs = yearsOfService(pr?.dateOfJoining);
  const row = (l: string, v: React.ReactNode) => <tr><td style={{ width: 170, color: "var(--slate)" }}>{l}</td><td>{v || "—"}</td></tr>;

  return (
    <Shell roleLabel="Faculty details" userName={user.name} navLinks={navForRole(user.role)}>
      <style>{"@media print { .no-print, nav, aside, header { display: none !important; } }"}</style>
      <div className="no-print" style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <a className="btn" href="/faculty-report">← All faculty</a><PrintButton />
      </div>
      <div className="card">
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <div style={{ width: 130, height: 160, border: "1px solid var(--line)", background: "#f4f1ea", overflow: "hidden" }}>
            {pr?.photo ? <img src={pr.photo} alt={person.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
          </div>
          <div style={{ flex: 1, minWidth: 280 }}>
            <h1 style={{ fontSize: 22, margin: 0 }}>{person.name}</h1>
            <div style={{ color: "var(--slate)", marginBottom: 8 }}>{[pr?.designation, person.department_?.name, pr?.employmentType].filter(Boolean).join(" · ") || "Profile not filled in yet"}</div>
            <table><tbody>
              {row("Email", person.email)}{row("Phone", pr?.phone)}{row("Address", pr?.address)}
              {row("Date of joining", `${day(pr?.dateOfJoining)}${yrs !== null ? ` (${yrs} years of service)` : ""}`)}
              {row("Date of birth", day(pr?.dateOfBirth))}{row("Gender", pr?.gender)}{row("Blood group", pr?.bloodGroup)}
              {row("Specialization", person.specialization)}
            </tbody></table>
          </div>
        </div>
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Next of kin</h3>
        <table><tbody>{row("Name", pr?.nextOfKinName)}{row("Relationship", pr?.nextOfKinRelation)}{row("Phone", pr?.nextOfKinPhone)}{row("Address", pr?.nextOfKinAddress)}</tbody></table>
        <div style={{ marginTop: 6, fontSize: 12, color: "var(--slate)" }}>Profile complete: {completeness(pr, records.filter((r) => r.kind === "EDUCATION").length)}%</div>
      </div>
      {KINDS.map((k) => {
        const items = records.filter((r) => r.kind === k.kind);
        return (
          <div className="card" key={k.kind}>
            <h3 style={{ marginTop: 0 }}>{k.heading} ({items.length})</h3>
            {items.length === 0 ? <p style={{ color: "var(--slate)", fontSize: 13, margin: 0 }}>Nothing entered.</p> : items.map((r) => (
              <div key={r.id} style={{ display: "flex", gap: 12, padding: "8px 0", borderTop: "1px solid #eee", fontSize: 13 }}>
                {r.photo && <img src={r.photo} alt="" style={{ width: 110, height: 78, objectFit: "cover", border: "1px solid var(--line)" }} />}
                <div>
                  <b>{r.title}</b>
                  <div style={{ color: "var(--slate)" }}>{[r.organisation, r.role, r.startYear ? `${r.startYear}${r.endYear ? `–${r.endYear}` : ""}` : null, r.amount, r.status].filter(Boolean).join(" · ")}</div>
                  {r.details && <div>{r.details}</div>}
                  {r.link && <div style={{ wordBreak: "break-all" }}>{r.link}</div>}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </Shell>
  );
}
