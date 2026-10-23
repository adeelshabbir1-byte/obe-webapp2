import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import HowCalculated from "../../components/HowCalculated";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { whoIs, rdb, day } from "../../lib/registers";
import { REFUND_HINT, STATUS, scheduleFor, canDecideRefunds } from "../../lib/feeRefunds";
import { ActionForm, ActionButton } from "../../components/fyp/FypClient";

export const dynamic = "force-dynamic";
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;
const REASON: Record<string, string> = { LEFT: "Left / withdrew", DROPPED: "Dropped", TRANSFER_OUT: "Transferred out" };

// Fee refunds: the refund schedule, and each leaving student's refund worked out, approved and paid.
export default async function FeeRefundsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const w = await whoIs(user as never);
  if (!w || !(canDecideRefunds(w) || w.leader)) redirect("/dashboard");
  const decide = canDecideRefunds(w);
  const schedule = await scheduleFor(w.chairmanId);
  let cases: { id: string; studentId: string; reason: string; withdrawalDate: Date; classesStart: Date | null; dayNo: number | null; tuitionPaid: number; nonRefundable: number; securityDeposit: number; refundPct: number; refundAmount: number; status: string; decidedAt: Date | null; paidAt: Date | null; paymentRef: string | null; note: string | null }[] | null = null;
  try { cases = await rdb.feeRefundCase.findMany({ where: { chairmanId: w.chairmanId }, orderBy: { createdAt: "desc" }, take: 300 }); } catch { cases = null; }
  const students = await prisma.student.findMany({ where: { id: { in: (cases || []).map((c) => c.studentId).concat(["none"]) } }, select: { id: true, name: true, rollNumber: true, batch: { select: { degreeProgram: true } } } });
  const sOf = new Map(students.map((s) => [s.id, s]));
  const owed = (cases || []).filter((c) => c.status === "APPROVED").reduce((t, c) => t + c.refundAmount, 0);
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Fee Refunds</h1>
      <p className="small-note" style={{ marginBottom: 10 }}>When a student&apos;s leaving is applied in Student Status Changes, their refund is worked out here by the schedule; the Finance Officer approves it and records the payment.</p>
      <HowCalculated shows="Refund = tuition paid × the schedule's % for the day the student left + any security deposit. Admission and registration fees are not refunded.">
        <ul style={{ margin: "0 0 4px 18px", padding: 0 }}>
          <li>Day of classes = days from the term&apos;s first day of classes (Semester Dates) to the effective date of leaving; day 1 is the first day.</li>
          <li>Default schedule (HEC fee refund policy): 100% up to day 7, 50% from day 8 to day 15, nothing from day 16. Change it below to match your notification.</li>
          <li>Payments on the student&apos;s latest invoice are counted against non-refundable fees first, then the deposit, then tuition.</li>
        </ul>
      </HowCalculated>
      {cases === null && <div className="err">{REFUND_HINT}</div>}
      <div className="card"><b>Schedule:</b> {schedule.map((s, i) => `${i === 0 ? "up to" : `day ${schedule[i - 1].uptoDay + 1} to`} day ${s.uptoDay}: ${s.pct}%`).join(" · ")} · after day {schedule[schedule.length - 1].uptoDay}: nothing.
        {decide && <div style={{ marginTop: 6 }}><ActionForm url="/api/fee-refunds" fixed={{ action: "schedule" }} submit="Save schedule" collapsed openLabel="Change the schedule" initial={{ rows: schedule.map((s) => `${s.uptoDay}:${s.pct}`).join(", ") }} fields={[{ name: "rows", label: "Up to day : refund %, …", width: 260 }]} /></div>}
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <p style={{ marginTop: 0 }}><b>{(cases || []).filter((c) => c.status === "PENDING").length}</b> waiting · <b>{rs(owed)}</b> approved and not yet paid</p>
        <table className="table" style={{ fontSize: 13 }}><thead><tr><th>Student</th><th>Left</th><th>Day of classes</th><th>Paid (tuition / non-refundable / deposit)</th><th>Refund</th><th>Status</th><th></th></tr></thead>
          <tbody>{(cases || []).map((c) => { const s = sOf.get(c.studentId); return (
            <tr key={c.id}><td><b>{s?.name}</b><div className="small-note" style={{ margin: 0 }}>{s?.rollNumber} · {s?.batch.degreeProgram}</div></td><td>{day(c.withdrawalDate)}<div className="small-note" style={{ margin: 0 }}>{REASON[c.reason] || c.reason}</div></td>
              <td>{c.dayNo ?? "—"}{c.classesStart ? <div className="small-note" style={{ margin: 0 }}>classes began {day(c.classesStart)}</div> : null}</td>
              <td>{rs(c.tuitionPaid)} / {rs(c.nonRefundable)} / {rs(c.securityDeposit)}</td>
              <td style={{ fontWeight: 800 }}>{rs(c.refundAmount)}<div className="small-note" style={{ margin: 0, fontWeight: 400 }}>{c.refundPct}% of tuition{c.securityDeposit ? " + deposit" : ""}</div></td>
              <td style={{ fontWeight: 700, color: c.status === "PAID" ? "#1E6B3A" : c.status === "REJECTED" ? "#6B7177" : "#9A3412" }}>{STATUS[c.status]}{c.paidAt ? <div className="small-note" style={{ margin: 0 }}>{day(c.paidAt)}{c.paymentRef ? ` · ${c.paymentRef}` : ""}</div> : null}{c.note && <div className="small-note" style={{ margin: 0, fontWeight: 400 }}>{c.note}</div>}</td>
              <td>{decide && c.status === "PENDING" && <><ActionForm url="/api/fee-refunds" fixed={{ action: "decide", id: c.id, approve: true }} submit="Approve" collapsed openLabel="Approve" initial={{ amount: c.refundAmount, note: "" }} fields={[{ name: "amount", label: "Amount (Rs)", type: "number", width: 110 }, { name: "note", label: "Note (needed if the amount changes)", width: 220 }]} /> <ActionButton url="/api/fee-refunds" body={{ action: "decide", id: c.id, approve: false }} label="Not refunded" className="act" askNote="Reason" noteRequired /></>}
                {decide && c.status === "APPROVED" && <ActionForm url="/api/fee-refunds" fixed={{ action: "paid", id: c.id }} submit="Mark paid" collapsed openLabel="Record payment" fields={[{ name: "paymentRef", label: "Cheque / transfer reference", width: 200 }]} />}</td></tr>); })}
            {!(cases || []).length && <tr><td colSpan={7}>No refund cases.</td></tr>}</tbody></table>
      </div>
    </Shell>
  );
}
