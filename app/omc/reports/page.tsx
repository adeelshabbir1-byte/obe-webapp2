import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { canViewReports, roleLabel } from "../../../lib/reportScope";
import { canViewReport } from "../../../lib/reportAcl";
import { REPORT_SECTIONS } from "../../../lib/reportRegistry";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";


export default async function ReportsHubPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");

  const filteredSections = await Promise.all(
    REPORT_SECTIONS.map(async (section) => {
      const cards = await Promise.all(
        section.cards.map(async (c) => ((await canViewReport(user, c.id)) ? c : null))
      );
      return { ...section, cards: cards.filter((c): c is NonNullable<typeof c> => c !== null) };
    })
  );
  const visibleSections = filteredSections.filter((s) => s.cards.length > 0);

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Reports</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Every report is exportable to Excel and printable.
      </p>
      {visibleSections.map((section) => (
        <div key={section.title} style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 15, marginBottom: 2, color: "var(--brass-dark)" }}>{section.title}</h2>
          <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 12 }}>{section.desc}</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {section.cards.map((c) => (
              <a key={c.href} href={c.href} className="card" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
                <h3 style={{ fontSize: 14, marginBottom: 6, color: "var(--brass-dark)" }}>{c.title}</h3>
                <p style={{ fontSize: 12, color: "var(--slate)" }}>{c.desc}</p>
              </a>
            ))}
          </div>
        </div>
      ))}
    </Shell>
  );
}
