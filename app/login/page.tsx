import Link from "next/link";
import { GraduationCap, Building2, ChevronRight } from "lucide-react";
import AuthLayout from "../../components/auth/AuthLayout";
import LoginForm from "../../components/auth/LoginForm";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthLayout
      heroTitle={<>Outcome-based education, <em>measured end to end.</em></>}
      heroText="Curricula, CLO–PLO mapping, assessments, attainment and accreditation evidence — one governed workspace for your whole institution."
    >
      <div className="auth-card">
        <img className="auth-logo" src="/brand/obehub-logo.webp" alt="OBEHUB — Outcome · Learn · Assess · Excel" width={720} height={501} />
        <h1>Welcome back</h1>
        <p className="auth-sub">Sign in to your institutional account.</p>
        <LoginForm />
        <div className="auth-links">
          <Link href="/student/login" className="auth-link-row">
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <GraduationCap size={18} style={{ color: "var(--violet-600)" }} />
              <span>Student Portal<small>Sign in with your roll number</small></span>
            </span>
            <ChevronRight size={16} />
          </Link>
          <Link href="/request-account" className="auth-link-row">
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Building2 size={18} style={{ color: "var(--emerald-600)" }} />
              <span>New institution?<small>Request an account</small></span>
            </span>
            <ChevronRight size={16} />
          </Link>
        </div>
        <p className="auth-foot">© {new Date().getFullYear()} Lets Innovate Pvt Ltd</p>
      </div>
    </AuthLayout>
  );
}
