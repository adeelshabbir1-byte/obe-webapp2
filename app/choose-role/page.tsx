import { redirect } from "next/navigation";
import { isDualCapable, DUAL_ROLE_LABEL, hatsOf } from "../../lib/dualRoles";
import { getAuthenticatedUser } from "../../lib/session";
import ChooseRoleButtons from "../../components/ChooseRoleButtons";
import { BRAND } from "../../lib/brandAssets";

export default async function ChooseRolePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");

  if (!isDualCapable(user.rawRole, user.secondaryRole, user.assignerHat || user.omcHat)) {
    redirect("/dashboard");
  }

  return (
    <div className="login-wrap">
      <div className="login-card" style={{ maxWidth: 520, textAlign: "center" }}>
        <img className="auth-logo" src={BRAND.logo.src} alt="OBEHUB" width={BRAND.logo.width} height={BRAND.logo.height} style={{ width: 150 }} />
        <h1 style={{ fontSize: 20, marginBottom: 6 }}>Welcome, {user.name}</h1>
        <p style={{ fontSize: 13, color: "var(--slate)", marginBottom: 28 }}>
          Your account can work as {hatsOf({ ...user, assignerHat: user.assignerHat, omcHat: user.omcHat }).map((r) => DUAL_ROLE_LABEL[r] || r).join(", ")}. Which one do you want to work as right now?
        </p>
        <ChooseRoleButtons roles={hatsOf({ ...user, assignerHat: user.assignerHat, omcHat: user.omcHat })} />
      </div>
    </div>
  );
}
