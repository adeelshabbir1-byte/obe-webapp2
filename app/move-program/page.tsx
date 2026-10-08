import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { loadMoveData } from "../../lib/programMove";
import Shell from "../../components/Shell";
import MoveProgramManager from "../../components/MoveProgramManager";

export default async function MoveProgramPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "HEAD_OF_DEPARTMENT" && user.role !== "CHAIRMAN") redirect("/dashboard");

  const scope = user.role === "CHAIRMAN" ? { chairmanId: user.id, departmentId: null } : { chairmanId: user.managedById || "", departmentId: user.departmentId || "none" };
  const data = await loadMoveData(scope);

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Move Program Data</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Batches belong to whoever created them. Batches made before the Program Leads were appointed are still with the earlier account, so the leads see nothing.
        Pick the Program Lead for each program and press Move: the batches, their courses, students, program learning outcomes and results go with it.
        The lead also gets a copy of the current term, grading scale and holidays if he has none yet. Teachers are moved separately under Teacher Program Moves.
      </p>
      <MoveProgramManager data={data} />
    </Shell>
  );
}
