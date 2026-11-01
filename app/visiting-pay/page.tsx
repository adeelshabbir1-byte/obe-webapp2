import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import Shell from "../../components/Shell";
import { prisma } from "../../lib/db";
import { ActionButton, ActionForm } from "../../components/fyp/FypClient";
import ExcelUploadForm from "../../components/ExcelUploadForm";
import { VP_HINT, vdb, STATUS, BASES, ruleFor, type Claim, type Line, type Assign, type Rule } from "../../lib/visitingPay";
import { settingOf, sheetsOf } from "../../lib/visitingPaySheets";
import { LATE_MODES } from "../../lib/visitingPayCore";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visiting Pay" };
const money = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;

function ClaimCard({ c, course, teacher, children }: { c: Claim; course: string; teacher: string; children?: React.ReactNode }) {
  const lines = JSON.parse(c.linesJson) as Line[];
  const reqs = JSON.parse(c.requirementsJson) as { item: string; ok: boolean; note: string }[];
  const flags = lines.filter((l) => l.flag).length;
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <b>{teacher} · {course} <span className="small-note">{c.periodStart.toISOString().slice(0, 10)} → {c.periodEnd.toISOString().slice(0, 10)}</span></b>
        <span style={{ fontWeight: 700 }}>{money(c.adjustedAmount ?? c.amount)}{c.adjustedAmount !== null && c.adjustedAmount !== c.amount ? <span className="small-note"> (system {money(c.amount)})</span> : null} · <span style={{ color: c.status === "PAID" ? "#1E6B34" : "#8A5A0F" }}>{STATUS[c.status] || c.status}</span></span>
      </div>
      <div style={{ overflowX: "auto", marginTop: 6 }}><table style={{ fontSize: 12, width: "100%" }}>
        <thead><tr><th>#</th><th>Date</th><th>Lecture time</th><th>Mode</th><th>On campus (biometric)</th><th>Topic</th><th>Attendance</th><th>Flag</th><th>Teacher&apos;s reason</th><th>Counted</th></tr></thead>
        <tbody>{lines.map((l) => <tr key={l.lectureNumber} style={l.flag ? { background: "#FFF8EC" } : undefined}>
          <td>{l.lectureNumber}</td><td>{l.date}</td><td>{l.start ? `${l.start}–${l.end}` : "—"} <span className="small-note">{l.minutes} min</span></td>
          <td>{l.mode === "ONLINE" ? "Online" : "On campus"}</td><td>{l.mode === "ONLINE" ? "n/a (online)" : l.inAt || l.outAt ? `${l.inAt || "?"} – ${l.outAt || "?"}` : "—"}</td>
          <td style={{ maxWidth: 220 }}>{l.topic}</td><td>{l.attendance ? "✓" : "✗"}</td><td style={{ color: "#B26A00" }}>{l.flag || ""}</td><td>{l.reason || ""}</td><td>{l.counted ? "✓" : "✗"}{l.plNote ? ` ${l.plNote}` : ""}</td></tr>)}
          {!lines.length && <tr><td colSpan={10} className="small-note">No lectures logged in this period yet.</td></tr>}</tbody></table></div>
      {reqs.length > 0 && <div style={{ fontSize: 12, marginTop: 6 }}><b>Due by now:</b> {reqs.map((r) => <span key={r.item} style={{ marginRight: 10, color: r.ok ? "#1E6B34" : "#B3261E" }}>{r.ok ? "✓" : "✗"} {r.item} — {r.note}</span>)}</div>}
      <div className="small-note" style={{ margin: "4px 0 0" }}>{lines.filter((l) => l.counted).length} lecture(s) counted · {flags} flagged{c.teacherNote ? ` · Teacher: ${c.teacherNote}` : ""}{c.plNote ? ` · Program Lead: ${c.plNote}` : ""}{c.deanNote ? ` · Dean: ${c.deanNote}` : ""}{c.paidRef ? ` · Paid: ${c.paidRef}` : ""}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>{children}</div>
    </div>
  );
}

// Visiting teaching pay: the teacher's claims, the Program Lead's vetting, the Dean's rules and approval, Accounts.
export default async function VisitingPayPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const chairmanId = user.role === "CHAIRMAN" ? user.id : await chairmanIdFor(user).catch(() => "");
  const shell = (x: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>{x}</Shell>;
  if (!chairmanId) redirect("/dashboard");
  let mine: Assign[], claims: Claim[];
  try {
    mine = (await vdb.visitingAssignment.findMany({ where: { userId: user.id, active: true } })) as Assign[];
    claims = (await vdb.visitingClaim.findMany({ where: { chairmanId }, orderBy: { periodStart: "desc" }, take: 300 })) as Claim[];
  } catch { return shell(<div className="err">{VP_HINT}</div>); }
  const courses = await prisma.course.findMany({ where: { id: { in: claims.map((c) => c.courseId).concat(mine.map((m) => m.courseId)).concat("none") } }, select: { id: true, code: true, title: true, coordinatorId: true, coordinator: { select: { department_: { select: { facultyId: true } } } } } });
  const people = await prisma.user.findMany({ where: { id: { in: claims.map((c) => c.userId).concat("none") } }, select: { id: true, name: true } });
  const cName = (id: string) => { const c = courses.find((x) => x.id === id); return c ? `${c.code} ${c.title}` : ""; };
  const pName = (id: string) => people.find((p) => p.id === id)?.name || "";
  const isLead = user.role === "PROGRAM_COORDINATOR", isDean = user.role === "DEAN" || user.role === "CHAIRMAN", isFin = user.role === "FINANCE_OFFICER" || user.role === "CHAIRMAN";
  const myClaims = claims.filter((c) => c.userId === user.id);
  const toVet = isLead ? claims.filter((c) => ["SUBMITTED", "PL_HELD", "DEAN_RETURNED"].includes(c.status) && courses.find((x) => x.id === c.courseId)?.coordinatorId === user.id) : [];
  const toApprove = isDean ? claims.filter((c) => c.status === "PL_FORWARDED" && (user.role === "CHAIRMAN" || courses.find((x) => x.id === c.courseId)?.coordinator.department_?.facultyId === user.facultyId)) : [];
  const toPay = isFin ? claims.filter((c) => c.status === "DEAN_APPROVED") : [];
  const leadCourses = isLead ? await prisma.course.findMany({ where: { coordinatorId: user.id, isOffered: true, instructorId: { not: null } }, select: { id: true, code: true, title: true, instructorId: true, instructor: { select: { name: true } }, batch: { select: { batchName: true } } }, orderBy: { code: "asc" } }) : [];
  const leadVisiting = isLead ? ((await vdb.visitingAssignment.findMany({ where: { courseId: { in: leadCourses.map((c) => c.id).concat("none") }, active: true } })) as Assign[]) : [];
  const depts = isDean ? await prisma.department.findMany({ where: { chairmanId, ...(user.role === "DEAN" && user.facultyId ? { facultyId: user.facultyId } : {}) }, select: { id: true, name: true } }) : [];
  const rules = isDean ? ((await vdb.visitingPayRule.findMany({ where: { chairmanId } })) as Rule[]) : [];
  const defRule = isDean ? await ruleFor(chairmanId, null) : null;
  // Section 10: visiting courses, pay rates, the institute's late / tax / period rules, pay sheets.
  const isHod = user.role === "HEAD_OF_DEPARTMENT";
  const pay = await settingOf(chairmanId);
  const rateCard = isDean ? ((await vdb.visitingRateCard?.findMany({ where: { chairmanId }, orderBy: [{ termLabel: "desc" }, { category: "asc" }] }).catch(() => [])) || []) as { termLabel: string; category: string; ratePerHour: number }[] : [];
  const placeholder = isLead ? await prisma.user.findFirst({ where: { isVisitingPlaceholder: true, managedById: chairmanId }, select: { id: true } }) : null;
  const unassigned = isLead ? await prisma.course.count({ where: { coordinatorId: user.id, isOffered: true, instructorId: null } }) : 0;
  const onPlaceholder = isLead && placeholder ? await prisma.course.findMany({ where: { coordinatorId: user.id, isOffered: true, instructorId: placeholder.id }, select: { id: true, code: true, title: true, batch: { select: { batchName: true } } }, orderBy: { code: "asc" } }) : [];
  const myTeachers = isLead ? await prisma.user.findMany({ where: { managedById: user.id, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT"] as never }, isActive: true, isVisitingPlaceholder: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  const allVisitingTeacherIds = Array.from(new Set(((await vdb.visitingAssignment.findMany({ where: { chairmanId, active: true }, select: { userId: true } }).catch(() => [])) as { userId: string }[]).map((x) => x.userId)));
  const payTeachers = (isLead || isDean) ? await prisma.user.findMany({ where: { id: { in: allVisitingTeacherIds.concat("none") }, ...(isLead ? { OR: [{ managedById: user.id }, { id: { in: leadVisiting.map((v) => v.userId).concat("none") } }] } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  const profiles = ((await vdb.visitingPayProfile?.findMany({ where: { userId: { in: payTeachers.map((t) => t.id).concat("none") } } }).catch(() => [])) || []) as { userId: string; category: string | null; ratePerHour: number | null; filer: boolean }[];
  const types = new Map((await prisma.facultyProfile.findMany({ where: { userId: { in: myTeachers.map((t) => t.id).concat(payTeachers.map((t) => t.id)).concat("none") } }, select: { userId: true, employmentType: true } })).map((p) => [p.userId, p.employmentType]));
  const typeOf = (id: string) => types.get(id) || "Permanent";
  const hodDeptUsers = isHod && user.departmentId ? (await prisma.user.findMany({ where: { departmentId: user.departmentId }, select: { id: true } })).map((u) => u.id) : [];
  const sheets = await sheetsOf(isFin || isDean ? { chairmanId } : isHod ? { chairmanId, userId: { in: hodDeptUsers.concat("none") } } : isLead ? { chairmanId, userId: { in: payTeachers.map((t) => t.id).concat(user.id) } } : { userId: user.id });
  const sheetPeople = new Map((await prisma.user.findMany({ where: { id: { in: sheets.map((s) => s.userId).concat("none") } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));

  return shell(<>
    <h1 style={{ fontSize: 22, marginBottom: 4 }}>Visiting Pay</h1>
    <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>Sections taught as <b>visiting</b> — by a visiting teacher, or a permanent teacher above their load in any department — are paid by the Dean&apos;s rules. Each period the claim is filled from the lecture log, the timetable and the biometric record; the teacher adds reasons and sends it → the <b>Program Lead</b> vets it (and can adjust) → the <b>Dean</b> approves → <b>Accounts</b> pays.</p>

    {mine.length > 0 && <div className="card"><h3 style={{ marginTop: 0 }}>My visiting teaching</h3>
      {mine.map((a) => <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}><b>{cName(a.courseId)}</b><ActionButton showMessage url="/api/visiting-pay" body={{ action: "build", assignmentId: a.id }} label="Prepare this period's claim" className="btn btn-secondary btn-sm" /></div>)}
    </div>}
    {myClaims.map((c) => { const lines = JSON.parse(c.linesJson) as Line[]; const open = ["DRAFT", "DEAN_RETURNED", "PL_HELD"].includes(c.status); return (
      <ClaimCard key={c.id} c={c} course={cName(c.courseId)} teacher="My claim">
        {open && <ActionForm showMessage url="/api/visiting-pay" fixed={{ action: "teacher", id: c.id, send: true }} submit="Send to the Program Lead" collapsed openLabel="Add reasons and send…"
          initial={Object.fromEntries([...lines.map((l) => [`reason_${l.lectureNumber}`, l.reason || ""]), ...lines.map((l) => [`mode_${l.lectureNumber}`, l.mode]), ["note", c.teacherNote || ""]])}
          fields={[...lines.flatMap((l) => [{ name: `mode_${l.lectureNumber}`, label: `#${l.lectureNumber} ${l.date}`, type: "select" as const, options: [["ON_CAMPUS", "On campus"], ["ONLINE", "Online"]] as [string, string][] }, { name: `reason_${l.lectureNumber}`, label: `Reason${l.flag ? ` (${l.flag})` : ""}`, width: 260 }]), { name: "note", label: "Note for the Program Lead", full: true }]} />}
        {open && <ActionButton showMessage url="/api/visiting-pay" body={{ action: "build", assignmentId: c.assignmentId }} label="Refresh from the records" className="btn btn-secondary btn-sm" />}
      </ClaimCard>); })}

    {isLead && <div className="card" style={{ overflowX: "auto" }}><h3 style={{ marginTop: 0 }}>Which sections are visiting?</h3>
      <p className="small-note" style={{ marginTop: 0 }}>Mark a section Visiting when its teacher is visiting, or a permanent teacher teaching it above their load.</p>
      <table style={{ fontSize: 12.5, width: "100%" }}><tbody>{leadCourses.map((c) => { const on = leadVisiting.some((v) => v.courseId === c.id && v.userId === c.instructorId); return (
        <tr key={c.id}><td><b>{c.code}</b> {c.title} <span className="small-note">{c.batch?.batchName}</span></td><td>{c.instructor?.name}</td>
          <td>{on ? <ActionButton showMessage url="/api/visiting-pay" body={{ action: "visiting", courseId: c.id, on: false }} label="Visiting ✓ — unmark" className="btn btn-sm" /> : <ActionButton showMessage url="/api/visiting-pay" body={{ action: "visiting", courseId: c.id, on: true }} label="Mark visiting" className="btn btn-secondary btn-sm" />}</td></tr>); })}</tbody></table></div>}
    {toVet.map((c) => <ClaimCard key={c.id} c={c} course={cName(c.courseId)} teacher={pName(c.userId)}>
      {(JSON.parse(c.linesJson) as Line[]).some((l) => l.flag) && <ActionForm showMessage url="/api/visiting-pay" fixed={{ action: "line", id: c.id }} submit="Record" collapsed openLabel="Accept or reject a mismatch…"
        fields={[{ name: "lectureNumber", label: "Lecture", type: "select", options: (JSON.parse(c.linesJson) as Line[]).filter((l) => l.flag).map((l) => [String(l.lectureNumber), `#${l.lectureNumber} ${l.date}: ${l.flag}`] as [string, string]) }, { name: "accept", label: "Decision", type: "select", options: [["true", "Accept — pay this class"], ["false", "Reject — don't pay"]] }, { name: "reason", label: "Reason", width: 260 }]} />}
      <ActionForm showMessage url="/api/visiting-pay" fixed={{ action: "pl", id: c.id, decision: "FORWARD" }} submit="Forward to the Dean" collapsed openLabel="Vet and forward…" initial={{ adjustedAmount: c.adjustedAmount ?? c.amount }}
        fields={[{ name: "uncount", label: "Lecture #s not to pay (comma)", width: 160 }, { name: "adjustedAmount", label: "Amount to pay", type: "number", width: 120 }, { name: "note", label: "Note", width: 260 }]} />
      <ActionButton showMessage url="/api/visiting-pay" body={{ action: "pl", id: c.id, decision: "HOLD" }} label="Hold" className="btn btn-secondary btn-sm" askNote="Why is it held? (e.g. marks of assignment 2 pending)" noteRequired />
    </ClaimCard>)}

    {isDean && <div className="card"><h3 style={{ marginTop: 0 }}>Rules (set by the Dean)</h3>
      {rules.length > 0 && <p className="small-note" style={{ marginTop: 0 }}>{rules.map((r) => `${r.departmentId ? depts.find((d) => d.id === r.departmentId)?.name || "a department" : "All departments"}: ${BASES.find(([k]) => k === r.basis)?.[1]} — theory Rs ${r.rateTheory}, lab Rs ${r.rateLab}, ${r.period.toLowerCase()}, grace ${r.lateGraceMin} min, late deduction ${r.latePenaltyPct}%, marks within ${r.marksWithinDays} days`).join(" · ")}</p>}
      <ActionForm showMessage url="/api/visiting-pay" fixed={{ action: "rule" }} submit="Save rules" collapsed openLabel="Set the rules…"
        initial={{ basis: defRule?.basis || "LECTURE", rateTheory: defRule?.rateTheory ?? "", rateLab: defRule?.rateLab ?? "", period: defRule?.period || "MONTHLY", lateGraceMin: defRule?.lateGraceMin ?? 10, latePenaltyPct: defRule?.latePenaltyPct ?? 0, marksWithinDays: defRule?.marksWithinDays ?? 14, requireAttendance: defRule?.requireAttendance ?? true, requireTopics: defRule?.requireTopics ?? true }}
        fields={[{ name: "departmentId", label: "For", type: "select", options: [["", "All departments"], ...depts.map((d) => [d.id, d.name] as [string, string])] }, { name: "basis", label: "Pay basis", type: "select", options: BASES.map(([k, l]) => [k, l] as [string, string]) }, { name: "rateTheory", label: "Rate — theory (Rs)", type: "number", width: 110 }, { name: "rateLab", label: "Rate — lab (Rs)", type: "number", width: 110 }, { name: "period", label: "Claim period", type: "select", options: [["MONTHLY", "Monthly"], ["SEMESTER", "Semester"]] }, { name: "lateGraceMin", label: "Late grace (min)", type: "number", width: 90 }, { name: "latePenaltyPct", label: "Late deduction % of a lecture", type: "number", width: 90 }, { name: "marksWithinDays", label: "Marks due within (days)", type: "number", width: 90 }, { name: "requireAttendance", label: "Attendance must be marked for every lecture", type: "checkbox" }, { name: "requireTopics", label: "Topic must be logged for every lecture", type: "checkbox" }]} />
    </div>}
    {(isDean || isFin) && <div className="card"><b>Biometric records</b><p className="small-note" style={{ marginTop: 2 }}>Upload the attendance machine&apos;s export (Excel or CSV): Employee code (or CNIC), Date, Time in, Time out. People are matched by the employee code / CNIC in their profile.</p><ExcelUploadForm url="/api/visiting-pay" label="Upload biometric file" /></div>}
    {toApprove.map((c) => <ClaimCard key={c.id} c={c} course={cName(c.courseId)} teacher={pName(c.userId)}>
      <ActionButton showMessage url="/api/visiting-pay" body={{ action: "dean", id: c.id, approve: true }} label="Approve for payment" className="btn btn-sm" />
      <ActionButton showMessage url="/api/visiting-pay" body={{ action: "dean", id: c.id, approve: false }} label="Return" className="btn btn-secondary btn-sm" askNote="Why is it returned?" noteRequired />
    </ClaimCard>)}

    {isFin && <div className="card"><b>Accounts</b> <a className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }} href={`/api/visiting-pay?sheet=${new Date().toISOString().slice(0, 7)}`}>This month&apos;s visiting-pay sheet (Excel)</a></div>}
    {toPay.map((c) => <ClaimCard key={c.id} c={c} course={cName(c.courseId)} teacher={pName(c.userId)}>
      <ActionButton showMessage url="/api/visiting-pay" body={{ action: "paid", id: c.id }} label="Mark paid" className="btn btn-sm" askNote="Payment reference (cheque / transfer no.)" noteRequired />
    </ClaimCard>)}
    {!mine.length && !myClaims.length && !isLead && !isDean && !isFin && !isHod && !sheets.some((s) => s.userId === user.id) && <div className="card small-note">No visiting teaching for you.</div>}

    {isLead && <div className="card" style={{ overflowX: "auto" }} data-visiting-courses><h3 style={{ marginTop: 0 }}>Visiting courses</h3>
      <p className="small-note" style={{ marginTop: 0 }}>{unassigned} offered course(s) without a teacher · {onPlaceholder.length} on “Visiting Faculty (to be decided)”. Hire visiting teachers (faculty type Visiting), then assign them here; the pay process follows.</p>
      {unassigned > 0 && <ActionButton showMessage url="/api/visiting-pay" body={{ action: "toVisiting" }} label={`Give all ${unassigned} unassigned course(s) to “Visiting Faculty (to be decided)”`} className="btn btn-sm" />}
      <table style={{ fontSize: 12.5, width: "100%", marginTop: 6 }}><tbody>{onPlaceholder.map((c) => <tr key={c.id}><td><b>{c.code}</b> {c.title} <span className="small-note">{c.batch?.batchName}</span></td>
        <td><ActionForm showMessage url="/api/visiting-pay" fixed={{ action: "assignVisiting", courseId: c.id }} submit="Assign" fields={[{ name: "userId", label: "Teacher", type: "select", options: myTeachers.map((t) => [t.id, `${t.name} (${typeOf(t.id)})`] as [string, string]) }]} /></td></tr>)}
        {!onPlaceholder.length && <tr><td className="small-note">No course is waiting for a visiting teacher.</td></tr>}</tbody></table></div>}

    {(isLead || isDean) && payTeachers.length > 0 && <div className="card" style={{ overflowX: "auto" }}><h3 style={{ marginTop: 0 }}>Pay rates of visiting teaching</h3>
      <p className="small-note" style={{ marginTop: 0 }}>Per hour, set before the semester: by category (the rate card below) or the teacher&apos;s own rate. Non-filers are taxed at the non-filer rate.</p>
      <table style={{ fontSize: 12.5 }}><thead><tr><th>Teacher</th><th>Type</th><th>Category / own rate / filer</th><th>Pay sheet</th></tr></thead><tbody>{payTeachers.map((t) => { const p = profiles.find((x) => x.userId === t.id); return (
        <tr key={t.id}><td>{t.name}</td><td>{typeOf(t.id)}</td>
          <td><ActionForm showMessage url="/api/visiting-pay" fixed={{ action: "profile", userId: t.id }} submit="Save" collapsed openLabel={`${p?.category || "no category"} · ${p?.ratePerHour ? `Rs ${p.ratePerHour}/h` : "card rate"} · ${p?.filer === false ? "non-filer" : "filer"}`} initial={{ category: p?.category || "", ratePerHour: p?.ratePerHour ?? "", filer: p?.filer === false ? "false" : "true" }} fields={[{ name: "category", label: "Category", width: 140 }, { name: "ratePerHour", label: "Own rate per hour (Rs)", type: "number", width: 110 }, { name: "filer", label: "Tax", type: "select", options: [["true", "Filer"], ["false", "Non-filer"]] }]} /></td>
          <td><ActionForm showMessage url="/api/visiting-pay" fixed={{ action: "sheet", userId: t.id }} submit="Make the pay sheet" fields={[{ name: "at", label: "Period containing", type: "date" }]} /></td></tr>); })}</tbody></table></div>}

    {isDean && <div className="card"><h3 style={{ marginTop: 0 }}>Late arrivals, tax and pay period</h3>
      <p className="small-note" style={{ marginTop: 0 }}>Late = biometric “in” after the class start + grace minutes (set in the rules above). Now: {LATE_MODES.find(([k]) => k === pay.lateMode)?.[1]}{pay.lateMode === "FIXED" ? ` Rs ${pay.lateFixed}` : pay.lateMode === "COUNT" ? ` (every ${pay.lateEveryN} lates)` : ""} · tax {pay.tax.mode === "PCT" ? `${pay.tax.filerPct}% filer / ${pay.tax.nonFilerPct}% non-filer` : `${pay.tax.slabs.length} slab(s)`} · period {defRule?.period === "WEEKS" ? `every ${pay.periodWeeks} weeks` : (defRule?.period || "MONTHLY").toLowerCase()}.</p>
      <ActionForm showMessage url="/api/visiting-pay" fixed={{ action: "setting" }} submit="Save" collapsed openLabel="Change…" initial={{ lateMode: pay.lateMode, lateFixed: pay.lateFixed, lateEveryN: pay.lateEveryN, periodWeeks: pay.periodWeeks, taxMode: pay.tax.mode, filerPct: pay.tax.filerPct, nonFilerPct: pay.tax.nonFilerPct, slabs: pay.tax.slabs.map((x) => `${x.upTo ?? 0}:${x.filerPct}/${x.nonFilerPct}`).join("; ") }}
        fields={[{ name: "lateMode", label: "Deduction for a late arrival", type: "select", options: LATE_MODES.map(([k, l]) => [k, l] as [string, string]) }, { name: "lateFixed", label: "Fixed amount per late (Rs)", type: "number", width: 110 }, { name: "lateEveryN", label: "X lates = one class", type: "number", width: 90 }, { name: "periodWeeks", label: "Weeks per pay period (period “every N weeks”)", type: "number", width: 90 }, { name: "taxMode", label: "Income tax", type: "select", options: [["PCT", "A flat %"], ["SLABS", "Slabs"]] }, { name: "filerPct", label: "Filer %", type: "number", width: 80 }, { name: "nonFilerPct", label: "Non-filer %", type: "number", width: 80 }, { name: "slabs", label: "Slabs: up to:filer%/non-filer%; … (0 = above)", width: 320 }]} />
      <div style={{ marginTop: 8 }}><b style={{ fontSize: 13 }}>Rate card (per hour)</b> <span className="small-note">{rateCard.map((r) => `${r.termLabel} ${r.category}: Rs ${r.ratePerHour}`).join(" · ") || "none yet"}</span>
        <ActionForm showMessage url="/api/visiting-pay" fixed={{ action: "rate" }} submit="Save rate" collapsed openLabel="Set a rate…" fields={[{ name: "termLabel", label: "Term (e.g. Fall 2026)", width: 120 }, { name: "category", label: "Category (e.g. Lecturer, PhD)", width: 160 }, { name: "ratePerHour", label: "Rate per hour (Rs)", type: "number", width: 110 }]} /></div>
      <div style={{ marginTop: 8 }}><ActionForm showMessage url="/api/visiting-pay" fixed={{ action: "biomap" }} submit="Remember" collapsed openLabel="The biometric file's column names…" initial={Object.fromEntries(Object.entries(pay.biometricMap).map(([k, v]) => [`map_${k}`, v]))} fields={[{ name: "map_code", label: "Employee ID column", width: 140 }, { name: "map_date", label: "Date column", width: 120 }, { name: "map_in", label: "Time-in column", width: 120 }, { name: "map_out", label: "Time-out column", width: 120 }]} /></div>
    </div>}

    {(isDean || isLead || isHod || isFin || user.role === "DEPARTMENT_COORDINATOR") && <div className="card"><b>Late-arrival report</b> <span className="small-note">every teacher (permanent, shared, visiting): lates and minutes per week and month, from the timetable and the biometric record</span>
      <a className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }} href={`/api/visiting-pay?lateReport=${new Date().toISOString().slice(0, 7)}&format=xlsx`}>This month (Excel)</a></div>}

    {sheets.length > 0 && <div className="card" style={{ overflowX: "auto" }} data-pay-sheets><h3 style={{ marginTop: 0 }}>{isLead || isDean || isHod || isFin ? "Pay sheets" : "My pay history"}</h3>
      <table style={{ fontSize: 12.5, width: "100%" }}><thead><tr><th>Teacher</th><th>Period</th><th>Hours × rate</th><th>Bonus</th><th>Deductions</th><th>Tax</th><th>Net</th><th>Status</th><th /></tr></thead>
        <tbody>{sheets.map((s) => <tr key={s.id} data-sheet={s.id}><td>{sheetPeople.get(s.userId) || "—"}</td><td>{s.periodStart.toISOString().slice(0, 10)} → {s.periodEnd.toISOString().slice(0, 10)}</td><td>{s.hours} h × Rs {s.rate} = {money(s.gross)}</td><td>{money(s.bonus)}</td><td>{money(s.deductions)}</td><td>{money(s.tax)}</td><td><b>{money(s.net)}</b></td>
          <td data-sheet-status>{s.status === "PAID" ? `Paid ${s.paidAt ? s.paidAt.toISOString().slice(0, 10) : ""}${s.paidRef ? ` (${s.paidRef})` : ""}` : s.status === "HOD_APPROVED" ? "Approved by the HOD — with Accounts" : "Waiting for the HOD"}</td>
          <td style={{ whiteSpace: "nowrap" }}><a href={`/api/visiting-pay?sheetPdf=${s.id}`} target="_blank" rel="noreferrer">PDF</a>
            {s.status === "DRAFT" && (isHod || user.role === "CHAIRMAN") && <> <ActionButton showMessage url="/api/visiting-pay" body={{ action: "hod", id: s.id }} label="Approve" className="btn btn-sm" /></>}
            {s.status === "HOD_APPROVED" && isFin && <> <ActionForm showMessage url="/api/visiting-pay" fixed={{ action: "sheetPaid", id: s.id }} submit="Mark paid" collapsed openLabel="Mark paid…" fields={[{ name: "ref", label: "Reference", width: 140 }, { name: "date", label: "Paid on", type: "date" }]} /></>}</td></tr>)}</tbody></table></div>}
  </>);
}
