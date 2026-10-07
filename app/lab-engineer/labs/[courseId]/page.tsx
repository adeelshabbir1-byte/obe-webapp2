import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../../lib/session";
import { labAccessFor } from "../../../../lib/labAccess";
import { labWorkspaceData } from "../../../../lib/labData";
import Shell from "../../../../components/Shell";
import { navForRole } from "../../../../components/reportNav";
import LabWorkspace from "../../../../components/LabWorkspace";

export default async function LabDetail({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  const access = await labAccessFor(user, params.courseId);
  if (!access) notFound();
  const data = await labWorkspaceData(access.lab, access.theory, access.as, user.id);
  return (
    <Shell roleLabel="Lab Engineer" userName={user.name} navLinks={navForRole(user.role)}>
      <Link href="/lab-engineer/labs" style={{ fontSize: 13, color: "var(--brass-dark)" }}>← My Labs</Link>
      <h1 style={{ fontSize: 22, margin: "6px 0 2px" }}>{access.lab.code} — {access.lab.title}</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        {access.lab.batch ? `${access.lab.batch.degreeProgram} ${access.lab.batch.batchName}` : "—"} · Lab Engineer: {access.lab.labEngineer?.name || "not named yet"} · Lab lead: {access.lead?.name || "not named yet"}
      </p>
      <LabWorkspace courseId={access.lab.id} as={access.as} theoryCode={access.theory?.code || null} {...data} />
    </Shell>
  );
}
