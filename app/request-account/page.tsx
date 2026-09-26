import RequestAccountForm from "../../components/RequestAccountForm";
import Link from "next/link";

export default function RequestAccountPage() {
  return (
    <div className="login-wrap">
      <div className="login-card" style={{ maxWidth: 440 }}>
        <img className="auth-logo" src="/brand/obehub-logo-v2.webp" alt="OBEHUB" width={440} height={363} style={{ width: 150 }} />
        <h1 style={{ textAlign: "center", fontSize: 20, marginBottom: 4 }}>Request an Institution Account</h1>
        <p style={{ textAlign: "center", color: "var(--slate)", fontSize: 13, marginBottom: 24 }}>
          Tell us about your institution — a platform administrator will review this and set up your account.
        </p>
        <RequestAccountForm />
        <p style={{ textAlign: "center", fontSize: 11.5, color: "var(--slate)", marginTop: 16 }}>
          Already have an account? <Link href="/login" style={{ color: "var(--brass-dark)" }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
