import { redirect } from "next/navigation";
import { isDualCapable, DUAL_ROLE_LABEL, hatsOf } from "../../lib/dualRoles";
import { getAuthenticatedUser } from "../../lib/session";
import ChooseRoleButtons from "../../components/ChooseRoleButtons";

export default async function ChooseRolePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");

  if (!isDualCapable(user.rawRole, user.secondaryRole)) {
    redirect("/dashboard");
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--paper)" }}>
      <div style={{ background: "#fff", padding: "40px 50px", maxWidth: 480, border: "1px solid var(--line)", textAlign: "center" }}>
        <h1 style={{ fontSize: 20, marginBottom: 6 }}>Welcome, {user.name}</h1>
        <p style={{ fontSize: 13, color: "var(--slate)", marginBottom: 28 }}>
          Your account can work as {hatsOf(user).map((r) => DUAL_ROLE_LABEL[r] || r).join(", ")}. Which one do you want to work as right now?
        </p>
        <ChooseRoleButtons roles={hatsOf(user)} />
      </div>
    </div>
  );
}
