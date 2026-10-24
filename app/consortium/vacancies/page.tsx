import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import { prisma } from "../../../lib/db";
import { ActionForm, ActionButton } from "../../../components/fyp/FypClient";
import { cdb, CONSORTIUM_HINT, memberOf } from "../../../lib/consortium";
import { institutionOf } from "../../../lib/consortiumAgreements";
import { OFFER_ROLES, openableCourses, labOf } from "../../../lib/consortiumOfferings";
import { profile, terms, type Vacancy, type VApp } from "../../../lib/consortiumVacancies";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visiting faculty" };

const ST: Record<string, [string, string]> = { APPLIED: ["Applied", "#B26A00"], SHORTLISTED: ["Shortlisted", "#1565C0"], OFFERED: ["Offered", "#6A1B9A"], ACCEPTED: ["Accepted", "#2E7D32"], DECLINED: ["Declined our offer", "#6B7177"], REJECTED: ["Not selected", "#6B7177"], WITHDRAWN: ["Withdrawn", "#6B7177"] };

// Host: post a course you have no teacher for; compare applicants on what OBEHUB knows about their teaching.
export default async function Vacancies({ searchParams }: { searchParams: { course?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const shell = (x: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>{x}</Shell>;
  if (!OFFER_ROLES.includes(user.role)) redirect("/consortium/teaching");
  const me = await institutionOf(user);
  const m = me ? await memberOf(me).catch(() => undefined) : null;
  if (m === undefined) return shell(<div className="err">{CONSORTIUM_HINT}</div>);
  if (m?.status !== "ACTIVE") return shell(<div className="card">Your university is not a consortium member yet.</div>);
  const [vacs, courses] = await Promise.all([cdb.consortiumVacancy.findMany({ where: { chairmanId: me }, orderBy: { createdAt: "desc" }, take: 60 }) as Promise<Vacancy[]>, openableCourses(user, me!)]);
  const apps = (await cdb.consortiumVacancyApplication.findMany({ where: { vacancyId: { in: vacs.map((v) => v.id) } } })) as VApp[];
  const vcs = await prisma.course.findMany({ where: { id: { in: vacs.map((v) => v.courseId) } }, select: { id: true, code: true, title: true, creditHours: true, hasLab: true, labPct: true, batch: { select: { batchName: true } } } });
  const heads = await prisma.user.findMany({ where: { id: { in: apps.map((a) => a.homeChairmanId) } }, select: { id: true, instituteName: true, name: true } });
  const profiles = new Map<string, Awaited<ReturnType<typeof profile>>>();
  for (const a of apps.filter((x) => !["WITHDRAWN"].includes(x.status))) profiles.set(a.id, await profile(a.applicantId, JSON.parse(a.shareJson || "{}"), vacs.find((v) => v.id === a.vacancyId)!.courseId));
  const fields = [
    { name: "term", label: "Term", type: "select" as const, options: terms().map((t) => [t, t] as [string, string]) },
    { name: "mode", label: "Teaching", type: "select" as const, options: [["ON_CAMPUS", "On our campus"], ["ONLINE", "Online"]] as [string, string][] },
    { name: "schedule", label: "Class times", width: 260 },
    { name: "pay", label: "Pay (PKR)", type: "number" as const, width: 110 }, { name: "payBasis", label: "per", type: "select" as const, options: [["per course", "course"], ["per credit hour", "credit hour"], ["per lecture", "lecture"]] as [string, string][] },
    { name: "showPay", label: "Show the pay on the post", type: "checkbox" as const },
    { name: "deadline", label: "Apply by", type: "date" as const }, { name: "requirements", label: "Requirements (qualification, experience)", type: "textarea" as const },
  ];
  return shell(<>
    <p className="small-note" style={{ margin: 0 }}><Link href="/consortium">← Consortium</Link></p>
    <h1 style={{ fontSize: 22, margin: "4px 0" }}>Consortium Faculty Posts</h1>
    <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>No teacher for a course? Post it here instead of advertising on your website. Faculty registered by other member universities see it and apply. You compare them on what OBEHUB knows — qualifications, how often they taught this course or its equivalent, and (only if they agree) their sections&apos; CLO attainment and student feedback — with a clash check against their own timetable. The person you hire teaches this course only, with your CLOs, lecture plan and course file.</p>
    <div className="card"><ActionForm showMessage url="/api/consortium/vacancies" fixed={{ action: "post" }} submit="Post vacancy" collapsed={!searchParams.course} openLabel="+ Post a teaching vacancy" initial={{ courseId: searchParams.course || "", term: terms()[0], showPay: true, payBasis: "per course" }}
      fields={[{ name: "courseId", label: "Course", type: "select", width: 420, options: [["", "—"], ...courses.map((c) => [c.id, `${c.batch?.batchName || ""} · ${c.code} ${c.title} (${c.creditHours}${labOf(c) ? ` = ${c.creditHours - labOf(c)}+${labOf(c)}` : ""} CH)`] as [string, string])] }, ...fields]} /></div>
    {!vacs.length ? <div className="card small-note">No vacancies posted.</div> : vacs.map((v) => { const c = vcs.find((x) => x.id === v.courseId); const as = apps.filter((a) => a.vacancyId === v.id).sort((x, y) => (profiles.get(y.id)?.score || 0) - (profiles.get(x.id)?.score || 0)); return (
      <div key={v.id} className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div><b>{c?.code} {c?.title}</b> <span className="small-note">{c?.batch?.batchName} · {v.term} · {v.mode === "ONLINE" ? "online" : "on campus"}{v.pay ? ` · PKR ${v.pay.toLocaleString()} ${v.payBasis || ""}${v.showPay ? "" : " (hidden)"}` : ""}</span></div>
          <span style={{ fontWeight: 700, color: v.status === "OPEN" ? "#B26A00" : v.status === "FILLED" ? "#2E7D32" : "#6B7177" }}>{v.status === "OPEN" ? `${as.length} applicant(s)` : v.status.toLowerCase()}</span>
        </div>
        <ActionForm showMessage url="/api/consortium/vacancies" fixed={{ action: "post", id: v.id }} submit="Save" collapsed openLabel="Edit post" initial={{ ...v, deadline: v.deadline?.toISOString().slice(0, 10) || "" }} fields={[...fields, { name: "status", label: "Post", type: "select", options: [["OPEN", "Open"], ["CLOSED", "Closed"], ["FILLED", "Filled"]] }]} />
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>{as.map((a, i) => { const p = profiles.get(a.id); const [l, col] = ST[a.status] || [a.status, "#555"]; return (
          <div key={a.id} style={{ border: "1px solid var(--line, #E1E5EA)", borderRadius: 10, padding: "10px 12px", display: "grid", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <div><span className="small-note">#{i + 1}</span> <b>{p?.user?.name}</b> <span className="small-note">{p?.designation || ""}{p?.designation ? ", " : ""}{heads.find((h) => h.id === a.homeChairmanId)?.instituteName || "—"}{p?.verified ? " · records verified by their university" : ""}</span>
                {p?.sponsored && <div className="small-note" style={{ color: "#6A1B9A" }}>Industry expert ({p.sponsored.employer}), sponsored by their university: {p.sponsored.reason}</div>}</div>
              <span style={{ color: col, fontWeight: 700, fontSize: 12.5 }}>{l}{a.nocStatus === "PENDING" ? " · NOC awaited" : a.nocStatus === "APPROVED" ? " · NOC given" : ""}</span>
            </div>
            {p && <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5 }}>
              <span>Degree: <b>{p.degree}</b></span><span>Experience: <b>{p.expYears}</b> yr</span><span>Taught this course: <b>{p.relevant.length}</b>×{p.relevant.length ? <span className="small-note"> ({p.relevant.slice(0, 4).join(", ")})</span> : null}</span>
              <span>Courses on OBEHUB: <b>{p.taughtCount}</b></span><span>Teaching now: <b>{p.teachingNow}</b></span>{p.publications ? <span>Publications: <b>{p.publications}</b></span> : null}
              <span>CLO attainment: <b>{p.attainment != null ? `${p.attainment}%` : JSON.parse(a.shareJson || "{}").attainment ? "no data" : "not shared"}</b></span>
              <span>Student feedback: <b>{p.feedback ? `${p.feedback.avg} / 5 (${p.feedback.n})` : JSON.parse(a.shareJson || "{}").feedback ? "no data" : "not shared"}</b></span>
              <span style={{ color: p.clashes.length ? "#C62828" : p.timetableKnown ? "#2E7D32" : "#6B7177" }}>{p.clashes.length ? `Clash: ${p.clashes.join("; ")}` : p.timetableKnown ? "No timetable clash" : "Clash check: timetable not on OBEHUB"}</span>
            </div>}
            {p?.education.length ? <div className="small-note">{p.education.map((e) => `${e.title}${e.organisation ? `, ${e.organisation}` : ""}${e.endYear ? ` (${e.endYear})` : ""}`).join(" · ")}</div> : null}
            {a.coverNote && <div style={{ fontSize: 12.5, whiteSpace: "pre-wrap" }}>“{a.coverNote}”</div>}
            {v.status === "OPEN" && ["APPLIED", "SHORTLISTED"].includes(a.status) && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {a.status === "APPLIED" && <ActionButton showMessage url="/api/consortium/vacancies" body={{ action: "shortlist", id: a.id }} label="Shortlist" className="btn btn-secondary btn-sm" />}
              <ActionButton showMessage url="/api/consortium/vacancies" body={{ action: "offer", id: a.id }} label="Offer the course" confirmText={`Offer ${c?.code} to ${p?.user?.name}?`} />
              <ActionButton showMessage url="/api/consortium/vacancies" body={{ action: "reject", id: a.id }} label="Not this time" className="btn btn-secondary btn-sm" askNote="Why? (the teacher sees this)" noteRequired /></div>}
          </div>); })}</div>
      </div>); })}
  </>);
}
