import Link from "next/link";
import AuthLayout from "../../components/auth/AuthLayout";
import ResetPasswordForm from "../../components/auth/ResetPasswordForm";
import { BRAND } from "../../lib/brandAssets";

export const metadata = { title: "Choose a new password", referrer: "no-referrer" };

// Reached from the emailed link. The token never leaves this page except to the reset API.
export default function ResetPasswordPage({ searchParams }: { searchParams: { token?: string } }) {
  return (
    <AuthLayout heroTitle={<>Choose a <em>new password.</em></>} heroText="Pick something only you know — not your login name, and at least 8 characters.">
      <div className="auth-card">
        <img className="auth-logo" src={BRAND.logo.src} alt="OBEHUB — Outcome · Learn · Assess · Excel" width={BRAND.logo.width} height={BRAND.logo.height} />
        <h1>New password</h1>
        <p className="auth-sub">You&apos;ll be signed out of every other device.</p>
        <ResetPasswordForm token={String(searchParams.token || "").slice(0, 200)} />
        <p className="auth-sub" style={{ marginBottom: 0 }}><Link href="/login">← Back to sign in</Link></p>
        <p className="auth-foot">© {new Date().getFullYear()} Lets Innovate Pvt Ltd</p>
      </div>
    </AuthLayout>
  );
}
