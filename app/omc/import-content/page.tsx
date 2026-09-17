import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import { OMC_ACTION_NAV } from "../../../components/reportNav";
import ImportCourseContentManager from "../../../components/ImportCourseContentManager";

export default async function ImportContentPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "OMC") redirect("/dashboard");

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={OMC_ACTION_NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Import Course Content</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Copy CLOs, PLO mappings, the weekly lecture plan, and assessment instruments from one course into
        an equivalent one — this does NOT combine them for teaching (see Course Equivalence for that);
        it's a one-time content copy. The target course's own existing content is replaced, not merged.
      </p>
      <ImportCourseContentManager />
    </Shell>
  );
}
