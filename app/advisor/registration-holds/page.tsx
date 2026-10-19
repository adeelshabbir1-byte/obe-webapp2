import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../../lib/reportScope";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import PersonAvatar from "../../../components/PersonAvatar";
import HoldDecision from "../../../components/HoldDecision";
import { holdsFor, choicesFor } from "../../../lib/autoRegister";
import { getPolicy } from "../../../lib/registrationRules";
import { studentPhotos } from "../../../lib/studentPhotos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Registration Holds" };

export default async function RegistrationHoldsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const batches = await prisma.batch.findMany({ where: { OR: [{ advisorId: user.id }, { coordinatorId: user.id }] }, select: { id: true, degreeProgram: true, batchName: true } });
  const holds = (await holdsFor({ batchId: { in: batches.map((b) => b.id).concat("none") } })) || [];
  const pending = holds.filter((h) => h.status === "PENDING"), done = holds.filter((h) => h.status === "DECIDED").slice(-20);
  const students = await prisma.student.findMany({ where: { id: { in: holds.map((h) => h.studentId).concat("none") } }, select: { id: true, name: true, rollNumber: true, currentSemesterNumber: true } });
  const sOf = new Map(students.map((s) => [s.id, s]));
  const photos = await studentPhotos(pending.map((h) => h.studentId));
  const policy = await getPolicy(await chairmanIdFor(user));
  const choices = new Map<string, Awaited<ReturnType<typeof choicesFor>>>();
  for (const h of pending) choices.set(h.id, await choicesFor(h.studentId, h.batchId));
  const bName = new Map(batches.map((b) => [b.id, `${b.degreeProgram} — ${b.batchName}`]));

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Registration Holds</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>
        Your advisees whose CGPA is under the limit set by the Controller of Examinations were not registered automatically. Choose their courses —
        repeats of failed courses are ticked first. Or lock a degree plan for a student and it will be registered from the plan. <Link href="/academic-rules">Rules</Link>
      </p>
      {pending.length === 0 && <div className="card small-note">Nobody is waiting.</div>}
      {pending.map((h) => {
        const s = sOf.get(h.studentId), c = choices.get(h.id)!;
        const days = Math.floor((Date.now() - new Date(h.createdAt).getTime()) / 864e5);
        return (
          <div key={h.id} className="card" style={{ borderLeft: `5px solid ${days > 3 ? "#C62828" : "#B26A00"}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
              <PersonAvatar name={s?.name || "?"} photo={photos.get(h.studentId)} size={36} />
              <b>{s?.name}</b> <span className="small-note">{s?.rollNumber} · {bName.get(h.batchId)} · semester {s?.currentSemesterNumber} · {h.term}</span>
              <span style={{ fontWeight: 700, color: "#C62828" }}>CGPA {h.cgpa.toFixed(2)}</span>
              <span className="small-note">waiting {days} day(s)</span>
              <Link href={`/advisor/students/${h.studentId}`} className="small-note">degree plan</Link> · <Link href={`/prediction/student/${h.studentId}`} className="small-note">prediction</Link>
            </div>
            <HoldDecision holdId={h.id} own={c.own} repeats={c.repeats.map((r) => ({ ...r, note: `repeat — failed earlier (with ${r.batch?.batchName || "another batch"})` }))} maxCredits={policy.maxCreditsLowCgpa} />
          </div>
        );
      })}
      {done.length > 0 && <div className="card small-note">Decided: {done.map((h) => `${sOf.get(h.studentId)?.name} (${h.term})`).join(" · ")}</div>}
    </Shell>
  );
}
