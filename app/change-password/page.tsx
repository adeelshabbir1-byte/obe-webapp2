import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import ChangePasswordForm from "../../components/ChangePasswordForm";

export default async function ChangePasswordPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--paper)" }}>
      <div style={{ background: "var(--card)", padding: "36px 40px", border: "1px solid var(--line)", width: 380 }}>
        <div className="seal">PW</div>
        <h1 style={{ fontSize: 18, textAlign: "center", marginBottom: 6 }}>{user.mustChangePassword ? "Set a New Password" : "Change Password"}</h1>
        <p style={{ fontSize: 12.5, color: "var(--slate)", textAlign: "center", marginBottom: 20 }}>
          {user.mustChangePassword ? "You must set a new password before continuing." : "Update your account password."}
        </p>
        <ChangePasswordForm forced={user.mustChangePassword} />
      </div>
    </div>
  );
}
