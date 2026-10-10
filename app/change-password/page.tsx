import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import ChangePasswordForm from "../../components/ChangePasswordForm";
import { BRAND } from "../../lib/brandAssets";

export default async function ChangePasswordPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  return (
    <div className="login-wrap">
      <div className="login-card">
        <img className="auth-logo" src={BRAND.logo.src} alt="OBEHUB" width={BRAND.logo.width} height={BRAND.logo.height} style={{ width: 150 }} />
        <h1 style={{ fontSize: 18, textAlign: "center", marginBottom: 6 }}>{user.mustChangePassword ? "Set a New Password" : "Change Password"}</h1>
        <p style={{ fontSize: 12.5, color: "var(--slate)", textAlign: "center", marginBottom: 20 }}>
          {user.mustChangePassword ? "You must set a new password before continuing." : "Update your account password."}
        </p>
        <ChangePasswordForm forced={user.mustChangePassword} />
        {!user.mustChangePassword && <p style={{ textAlign: "center", marginTop: 14, fontSize: 13 }}><a href="/dashboard">← Back to dashboard</a></p>}
      </div>
    </div>
  );
}
