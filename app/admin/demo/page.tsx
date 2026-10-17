import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { demoSummary, sourceOptions, DEMO_PASSWORD, DEMO_NAME } from "../../../lib/demoInstitute";
import DemoInstituteRunner from "../../../components/DemoInstituteRunner";

export const dynamic = "force-dynamic";

export default async function DemoInstitutePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "SUPER_USER") redirect("/dashboard");
  const [summary, sources] = await Promise.all([demoSummary(), sourceOptions()]);
  return (
    <Shell roleLabel="Super User" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Demo Institute</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>
        Builds <b>{DEMO_NAME}</b> for presentations: a copy of a real institute&apos;s curriculum with two batches (BS CS and BS AI, started Fall 2024,
        now in semester 5), fake faculty and 30 students per batch. Semesters 1–4 are completed with approved results and transcripts; semester 5 is
        running (lectures to week 8, attendance, quizzes, assignments and midterm marked). Nothing is emailed. Real institutes are not touched.
      </p>
      <DemoInstituteRunner summary={summary ? { ...summary, createdAt: summary.createdAt.toISOString() } : null} sources={sources} password={DEMO_PASSWORD} />
    </Shell>
  );
}
