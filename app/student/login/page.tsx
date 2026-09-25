import Link from "next/link";
import { Briefcase, ChevronRight } from "lucide-react";
import AuthLayout from "../../../components/auth/AuthLayout";
import StudentLoginForm from "../../../components/auth/StudentLoginForm";

export const metadata = { title: "Student sign in" };

export default function StudentLoginPage() {
  return (
    <AuthLayout
      heroTitle={<>Your degree, <em>one clear plan.</em></>}
      heroText="Register for courses, choose electives, plan every semester and see how you are progressing against your program's learning outcomes."
    >
      <div className="auth-card">
        <img className="auth-logo" src="/brand/obehub-logo.webp" alt="OBEHUB — Outcome · Learn · Assess · Excel" width={720} height={501} />
        <h1>Student Portal</h1>
        <p className="auth-sub">Sign in with your roll number.</p>
        <StudentLoginForm />
        <p className="small-note" style={{ textAlign: "center", marginTop: 16, lineHeight: 1.55 }}>
          First time here? Your initial password is your own roll number — you'll be asked to set a new one
          right after signing in. If that doesn't work, check with your Program Coordinator.
        </p>
        <div className="auth-links">
          <Link href="/login" className="auth-link-row">
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Briefcase size={18} style={{ color: "var(--royal-600)" }} />
              <span>Faculty or staff?<small>Go to the institutional sign in</small></span>
            </span>
            <ChevronRight size={16} />
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
