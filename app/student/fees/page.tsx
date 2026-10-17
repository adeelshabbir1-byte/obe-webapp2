import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import StudentShell from "../../../components/StudentShell";
import { edb, money } from "../../../lib/erp";
import { balanceOf } from "../../../lib/fees";

export const dynamic = "force-dynamic";

export default async function StudentFeesPage() {
  const student = await getAuthenticatedStudent();
  if (!student) redirect("/student/login");
  const invs = ((await edb.feeInvoice.findMany({ where: { studentId: student.id }, orderBy: { createdAt: "desc" } }).catch(() => [])) as { id: string; termName: string; termYear: number; amount: number; discount: number; fine: number; paid: number; dueDate: Date; status: string }[]);
  return (
    <StudentShell studentName={student.name}>
      <h1 style={{ fontSize: 22 }}>My Fees</h1>
      <div className="card">
        {invs.length === 0 ? <p style={{ margin: 0 }}>No fee invoices yet.</p> : (
          <table><thead><tr><th>Term</th><th>Amount</th><th>Balance</th><th>Due</th><th /></tr></thead>
            <tbody>{invs.map((i) => <tr key={i.id}><td>{i.termName} {i.termYear}</td><td>{money(i.amount - i.discount + i.fine)}</td><td style={{ color: balanceOf(i) > 0 ? "#B3261E" : "#1F5E36", fontWeight: 700 }}>{money(balanceOf(i))}</td><td>{i.dueDate.toISOString().slice(0, 10)}</td><td><a href={`/fees/challan/${i.id}`} target="_blank" rel="noopener noreferrer">{i.status === "PAID" ? "Receipt" : "Challan"}</a></td></tr>)}</tbody></table>
        )}
      </div>
    </StudentShell>
  );
}
