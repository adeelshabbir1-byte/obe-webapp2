import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import { OMC_ACTION_NAV } from "../../../components/reportNav";
import EquivalenceManager from "../../../components/EquivalenceManager";
import EquivalenceSuggestions from "../../../components/EquivalenceSuggestions";



export default async function OmcEquivalencePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "OMC") redirect("/dashboard");

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={OMC_ACTION_NAV}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Course Equivalence</h1>
        <a href="/api/omc/equivalence/export" className="btn btn-export" style={{ textDecoration: "none" }}>Export to Excel</a>
      </div>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Mark courses from different batches or degree programs (even with different codes/names) as the same
        underlying course, so they can be taught together as one combined class. Sections are calculated
        automatically once combined enrollment crosses 50 students.
      </p>
      <EquivalenceSuggestions />
      <EquivalenceManager />
    </Shell>
  );
}
