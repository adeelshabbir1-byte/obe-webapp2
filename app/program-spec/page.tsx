import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import QualityShell from "../../components/QualityShell";
import PrintButton from "../../components/PrintButton";
import { programsFor } from "../../lib/quality";
import { qaInstitute, records, qadb } from "../../lib/qaOffice";
import { countedCredits, countsTowardDegree } from "../../lib/courseTypes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Program specification" };

const LEVEL: Record<string, [string, string]> = { UG16: ["Bachelor (4 years, 16 years of education)", "6"], ADP: ["Associate degree (2 years, 14 years)", "5"] };

// The program specification document (HEC National Qualifications Framework style), generated from what OBEHUB holds.
export default async function ProgramSpec({ searchParams }: { searchParams: { p?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const progs = await programsFor(user).catch(() => []);
  if (!progs.length) redirect("/home");
  const sel = progs.find((p) => p.key === searchParams.p) || progs[0];
  const cid = await qaInstitute(user);
  const [inst, profile, dp, adm, batch, pqr] = await Promise.all([
    prisma.user.findUnique({ where: { id: cid }, select: { instituteName: true, name: true } }),
    prisma.programProfile.findFirst({ where: { coordinatorId: sel.coordinatorId, degreeProgram: sel.degreeProgram } }),
    qadb.departmentProgram.findFirst({ where: { chairmanId: cid, degreeProgram: sel.degreeProgram }, select: { accreditationBody: true, department: { select: { name: true } } } }).catch(() => null) as Promise<{ accreditationBody: string | null; department: { name: string } } | null>,
    prisma.admissionCriteria.findFirst({ where: { chairmanId: cid, degreeProgram: sel.degreeProgram }, orderBy: { updatedAt: "desc" } }).catch(() => null),
    prisma.batch.findFirst({ where: { coordinatorId: sel.coordinatorId, degreeProgram: sel.degreeProgram }, orderBy: [{ startYear: "desc" }], select: { id: true, batchName: true } }),
    records(cid, "PQR").then((rs) => (rs || []).find((r) => r.data.program === sel.degreeProgram) || null),
  ]);
  const [plos, courses] = batch ? await Promise.all([
    prisma.pLO.findMany({ where: { batchId: batch.id }, orderBy: { number: "asc" }, select: { number: true, title: true, description: true } }),
    prisma.course.findMany({ where: { batchId: batch.id }, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }], select: { id: true, code: true, title: true, creditHours: true, courseType: true, semesterNumber: true } }),
  ]) : [[], []];
  const inst2 = courses.length ? await prisma.assessmentInstrument.findMany({ where: { courseId: { in: courses.map((c) => c.id) }, source: "SE", partOfId: null }, select: { type: true, marksPct: true, courseId: true } }) : [];
  const byType = new Map<string, number[]>();
  for (const i of inst2) byType.set(i.type, (byType.get(i.type) || []).concat(i.marksPct));
  const nCourses = new Set(inst2.map((i) => i.courseId)).size || 1;
  let peos: string[] = []; try { peos = profile?.peos ? JSON.parse(profile.peos) : []; } catch { peos = []; }
  const total = countedCredits(courses);
  const options = courses.filter((c) => !countsTowardDegree(c.courseType) && /domain/i.test(c.courseType));
  const scheme = courses.filter((c) => !options.includes(c));
  const sems = Array.from(new Set(scheme.map((c) => c.semesterNumber ?? 0))).sort((a, b) => a - b);
  const typeCH = new Map<string, number>(); scheme.filter((c) => countsTowardDegree(c.courseType)).forEach((c) => typeCH.set(c.courseType, (typeCH.get(c.courseType) || 0) + c.creditHours));
  const lvl = LEVEL[profile?.programLevel || "UG16"] || LEVEL.UG16;
  const d = (x?: Date | null) => (x ? new Date(x).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—");
  const H = ({ n, t }: { n: number; t: string }) => <h3 style={{ fontSize: 15, borderBottom: "1px solid #ccc", paddingBottom: 3 }}>{n}. {t}</h3>;
  return (
    <QualityShell user={user} title="Program specification" intro="Generated from OBEHUB's records of the program (latest batch). Print it for approvals, PQR registration and accreditation; fill any gaps where the source data is entered.">
      <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <Link href="/quality-office">← Quality Office</Link>
        <form style={{ display: "flex", gap: 6 }}><select name="p" defaultValue={sel.key}>{progs.map((p) => <option key={p.key} value={p.key}>{p.degreeProgram} ({p.lead})</option>)}</select><button className="btn btn-sm btn-secondary">Show</button></form>
        <PrintButton />
      </div>
      <div className="card" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
        <div style={{ textAlign: "center" }}><div style={{ fontWeight: 800, fontSize: 18 }}>{inst?.instituteName || inst?.name}</div><div style={{ fontWeight: 700 }}>PROGRAM SPECIFICATION — {sel.degreeProgram}</div></div>
        <H n={1} t="Basic information" />
        <table><tbody>
          <tr><td>Award</td><td><b>{sel.degreeProgram}</b></td></tr>
          <tr><td>Level / NQF level</td><td>{lvl[0]} — NQF level {pqr?.data.nqfLevel || lvl[1]}</td></tr>
          <tr><td>Department</td><td>{dp?.department.name || "—"}</td></tr>
          <tr><td>Accreditation council</td><td>{dp?.accreditationBody || "—"}</td></tr>
          <tr><td>Total credit hours</td><td>{total || "—"} (latest batch {batch?.batchName || "—"})</td></tr>
          <tr><td>Duration</td><td>{sems.filter((s) => s > 0).length || "—"} semesters</td></tr>
          <tr><td>Approvals</td><td>Academic Council {d(profile?.academicCouncilDate)}; HEC NOC {d(profile?.hecNocDate)}; launched {d(profile?.launchDate)}</td></tr>
          <tr><td>PQR registration</td><td>{pqr ? `${pqr.data.regNo || "—"} (${pqr.data.status})` : "not recorded"}</td></tr>
          <tr><td>Program Lead</td><td>{sel.lead}</td></tr>
        </tbody></table>
        <H n={2} t="Entry requirements" />
        {adm ? <p>Minimum {adm.minPercentage ?? "—"}% in the qualifying examination{adm.requiredSubjects ? ` with ${adm.requiredSubjects}` : ""}{adm.entryTest ? `; entry test: ${adm.entryTest}${adm.minTestScore ? ` (minimum ${adm.minTestScore})` : ""}` : ""}{adm.seats ? `; ${adm.seats} seats` : ""}.{adm.otherConditions ? ` ${adm.otherConditions}` : ""}</p> : <p className="small-note">Not set — see Admission Criteria.</p>}
        <H n={3} t="Vision, mission and educational objectives" />
        {profile?.departmentVision && <p><b>Vision.</b> {profile.departmentVision}</p>}
        {profile?.departmentMission && <p><b>Mission.</b> {profile.departmentMission}</p>}
        {peos.length ? <ol>{peos.map((p, i) => <li key={i}>{p}</li>)}</ol> : <p className="small-note">PEOs not set.</p>}
        <H n={4} t="Graduate attributes / program learning outcomes" />
        {plos.length ? <ol>{plos.map((p) => <li key={p.number} value={p.number}><b>{p.title}:</b> {p.description}</li>)}</ol> : <p className="small-note">No GAs recorded for the latest batch.</p>}
        <H n={5} t="Program structure" />
        <p>{Array.from(typeCH.entries()).map(([t, ch]) => `${t} ${ch} CH`).join(" · ")}</p>
        {sems.map((s) => (
          <div key={s} style={{ breakInside: "avoid" }}><b>{s ? `Semester ${s}` : "Not placed in a semester"}</b>
            <table style={{ fontSize: 12.5, width: "100%" }}><tbody>{scheme.filter((c) => (c.semesterNumber ?? 0) === s).map((c) => <tr key={c.id}><td style={{ width: 90 }}>{c.code}</td><td>{c.title}</td><td style={{ width: 90 }}>{c.courseType}</td><td style={{ width: 40, textAlign: "right" }}>{c.creditHours}</td></tr>)}</tbody></table></div>
        ))}
        {options.length > 0 && <p><b>Elective / interdisciplinary options</b> (students choose these for the elective slots; not counted again): {options.map((c) => `${c.code} ${c.title}`).join("; ")}.</p>}
        <H n={6} t="Teaching, learning and assessment" />
        <p>Each course has CLOs mapped to the graduate attributes, a lecture plan and an assessment plan approved by the Outcome Management Committee; attainment is measured per CLO and GA every semester and reviewed for continuous improvement.</p>
        {byType.size > 0 && <p>Typical weight of assessments (average over {nCourses} courses): {Array.from(byType.entries()).map(([t, xs]) => `${t} ${Math.round(xs.reduce((a, b) => a + b, 0) / nCourses)}%`).join(", ")}.</p>}
        <H n={7} t="Quality assurance" />
        <p>Course and teacher feedback each semester, alumni and employer surveys for the PEOs, OMC review of course files, the self-assessment cycle with the QEC, and accreditation by {dp?.accreditationBody || "the relevant council"}.</p>
      </div>
    </QualityShell>
  );
}
