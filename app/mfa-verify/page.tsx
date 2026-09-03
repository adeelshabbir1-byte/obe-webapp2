import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import MfaVerifyForm from "../../components/MfaVerifyForm";

export default async function MfaVerifyPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.mfaVerified) redirect("/dashboard");

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--paper)" }}>
      <div style={{ background: "var(--card)", padding: "36px 40px", border: "1px solid var(--line)", width: 380 }}>
        <div className="seal">MFA</div>
        <h1 style={{ fontSize: 18, textAlign: "center", marginBottom: 6 }}>Two-Factor Verification</h1>
        <p style={{ fontSize: 12.5, color: "var(--slate)", textAlign: "center", marginBottom: 20 }}>
          Enter the 6-digit code from your authenticator app, {user.name}.
        </p>
        <MfaVerifyForm />
      </div>
    </div>
  );
}
