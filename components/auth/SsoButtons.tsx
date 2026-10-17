import { enabledProviders } from "../../lib/sso";

const MSG: Record<string, string> = { off: "That sign-in option is not set up.", expired: "The sign-in took too long. Please try again.", invalid: "Sign-in could not be verified. Please try again.", noemail: "Your account did not share a verified email.", domain: "Use your institutional email account.", noaccount: "No OBEHUB account uses that email. Ask your Institute Head to add you, or sign in with your username." };

export default function SsoButtons({ error }: { error?: string }) {
  const ps = enabledProviders();
  return (
    <>
      {error && MSG[error] && <div className="err" style={{ marginTop: 8 }}>{MSG[error]}</div>}
      {ps.length > 0 && (
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          <div className="small-note" style={{ textAlign: "center" }}>or</div>
          {ps.map((p) => <a key={p.key} href={`/api/auth/sso/${p.key}/start`} className="btn btn-secondary" style={{ textAlign: "center" }}>Sign in with {p.name}</a>)}
        </div>
      )}
    </>
  );
}
