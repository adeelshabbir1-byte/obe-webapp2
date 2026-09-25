import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import ChooseRoleButtons from "../../components/ChooseRoleButtons";

export default async function ChooseRolePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");

  if (!(user.rawRole === "SUBJECT_EXPERT" && user.secondaryRole === "INSTRUCTOR")) {
    redirect("/dashboard");
  }

  return (
    <div className="login-wrap">
      <div className="login-card" style={{ maxWidth: 480, textAlign: "center" }}>
        <img className="auth-logo" src="/brand/obehub-logo.webp" alt="OBEHUB" width={720} height={501} style={{ width: 150 }} />
        <h1 style={{ fontSize: 20, marginBottom: 6 }}>Welcome, {user.name}</h1>
        <p style={{ fontSize: 13, color: "var(--slate)", marginBottom: 28 }}>
          Your account can act as both a Subject Expert and an Instructor. Which one do you want to work as right now?
        </p>
        <ChooseRoleButtons />
      </div>
    </div>
  );
}
