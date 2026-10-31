import Link from "next/link";
import { DEMO_ROLES } from "../../lib/demoReadyCore";
import { theDemo, demoProgress } from "../../lib/demoReady";
import DemoLogins, { DemoLoginButton } from "../../components/DemoLogins";

export const dynamic = "force-dynamic";
export const metadata = { title: "Demo institute" };

// The demo institute's front door: one-click logins (one per role, each with what that person does daily) and the
// demo script — the Instructor enters the last course's final marks, the HOD approves, the Controller publishes,
// attainment updates and the SAR opens complete.
export default async function DemoPage() {
  const d = await theDemo();
  const on = !!d?.flag.loginsOn;
  const p = on ? await demoProgress() : null;
  const course = p?.course;
  const tick = (ok: boolean) => <span style={{ color: ok ? "#1B6B3A" : "var(--slate)", fontWeight: 700, marginRight: 6 }}>{ok ? "✓" : "○"}</span>;
  const steps = course ? [
    { done: p!.marked && !!p!.result, who: "instructor", label: "Instructor", text: <>Enter the final-exam marks of <b>{course.code} {course.title}</b> (type them, or press <i>Fill sample marks</i>), then <i>Submit result</i>.</>, next: `/instructor/courses/${course.id}/marks` },
    { done: p!.result === "APPROVED", who: "hod", label: "HOD", text: <>Approve the result in one click.</>, next: "/results-approval" },
    { done: p!.published, who: "controller", label: "Controller", text: <>Publish the approved result.</>, next: "/controller" },
    { done: p!.result === "APPROVED", who: "lead", label: "Program Lead", text: <>See the CLO and GA attainment update.</>, next: `/courses/${course.id}/clo-attainment` },
    { done: p!.result === "APPROVED", who: "lead", label: "Program Lead", text: <>Open the readiness page (all green) and the SAR, complete — print it to PDF.</>, next: `/coordinator/accreditation-status?batchId=${course.batchId}` },
  ] : [];
  return (
    <main style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 16px 48px" }}>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Demo institute</h1>
      {!on ? (
        <div className="card"><p style={{ margin: 0 }}>The demo logins are not available right now.</p><p style={{ margin: "8px 0 0" }}><Link href="/login">Go to the sign-in page</Link></p></div>
      ) : (
        <>
          <p style={{ color: "var(--slate)", fontSize: 14, marginTop: 0 }}>
            A complete institute where everything is done except one course of this semester: its final-exam marks. Faculty only do their usual daily tasks;
            the visit readiness comes out of that normal work. Nothing here touches a real institute.
          </p>
          {course && (
            <section className="card" style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: 17, marginTop: 0 }}>Demo script</h2>
              <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 10 }}>
                {steps.map((s, i) => (
                  <li key={i} style={{ fontSize: 14 }}>
                    {tick(s.done)}<b>{s.label}:</b> {s.text}{" "}
                    <DemoLoginButton role={s.who} next={s.next} primary>Sign in as {s.label} →</DemoLoginButton>
                  </li>
                ))}
              </ol>
            </section>
          )}
          <h2 style={{ fontSize: 17 }}>Sign in as</h2>
          <DemoLogins roles={DEMO_ROLES.map(({ key, label, daily }) => ({ key, label, daily }))} />
        </>
      )}
    </main>
  );
}
