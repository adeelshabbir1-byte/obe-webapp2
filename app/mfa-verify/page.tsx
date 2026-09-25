import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import MfaVerifyForm from "../../components/MfaVerifyForm";

export default async function MfaVerifyPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.mfaVerified) redirect("/dashboard");

  return (
    <div className="login-wrap">
      <div className="login-card">
        <img className="auth-logo" src="/brand/obehub-logo.webp" alt="OBEHUB" width={720} height={501} style={{ width: 150 }} />
        <h1 style={{ fontSize: 18, textAlign: "center", marginBottom: 6 }}>Two-Factor Verification</h1>
        <p style={{ fontSize: 12.5, color: "var(--slate)", textAlign: "center", marginBottom: 20 }}>
          Enter the 6-digit code from your authenticator app, {user.name}.
        </p>
        <MfaVerifyForm />
      </div>
    </div>
  );
}
