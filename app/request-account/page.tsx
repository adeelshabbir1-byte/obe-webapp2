import RequestAccountForm from "../../components/RequestAccountForm";

export default function RequestAccountPage() {
  return (
    <div className="login-wrap">
      <div className="login-card" style={{ maxWidth: 440 }}>
        <div className="seal">NC</div>
        <h1 style={{ textAlign: "center", fontSize: 20, marginBottom: 4 }}>Request an Institution Account</h1>
        <p style={{ textAlign: "center", color: "var(--slate)", fontSize: 13, marginBottom: 24 }}>
          Tell us about your institution — a platform administrator will review this and set up your account.
        </p>
        <RequestAccountForm />
        <p style={{ textAlign: "center", fontSize: 11.5, color: "var(--slate)", marginTop: 16 }}>
          Already have an account? <a href="/login" style={{ color: "var(--brass-dark)" }}>Sign in</a>
        </p>
      </div>
    </div>
  );
}
