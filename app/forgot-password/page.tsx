import Link from "next/link";
import AuthLayout from "../../components/auth/AuthLayout";
import ForgotPasswordForm from "../../components/auth/ForgotPasswordForm";
import { BRAND } from "../../lib/brandAssets";

export const metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      heroTitle={<>Locked out? <em>Back in a minute.</em></>}
      heroText="We email a one-time link to the address on your account. It works once, for 30 minutes."
    >
      <div className="auth-card">
        <img className="auth-logo" src={BRAND.logo.src} alt="OBEHUB — Outcome · Learn · Assess · Excel" width={BRAND.logo.width} height={BRAND.logo.height} />
        <h1>Forgot your password?</h1>
        <p className="auth-sub">Enter your login name or email and we&apos;ll send you a link to choose a new one.</p>
        <ForgotPasswordForm />
        <p className="auth-hint" style={{ textAlign: "left", margin: "4px 0 14px" }}>
          No email on your account, or it doesn&apos;t arrive? Teachers ask their Program Lead; everyone else asks the Institute Head to reset it. Students: your Program Lead resets your login to your roll number.
        </p>
        <p className="auth-sub" style={{ marginBottom: 0 }}><Link href="/login">← Back to sign in</Link></p>
        <p className="auth-foot">© {new Date().getFullYear()} Lets Innovate Pvt Ltd</p>
      </div>
    </AuthLayout>
  );
}
