"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ExcelImportButton from "./ExcelImportButton";

type Entry = { fiscalYear: string; kind: string; category: string; amount: number };

export default function FinanceManager({ years, year, entries, expense, income }: { years: string[]; year: string; entries: Entry[]; expense: string[]; income: string[] }) {
  const router = useRouter();
  const get = (kind: string, category: string, y = year) => entries.find((e) => e.fiscalYear === y && e.kind === kind && e.category === category)?.amount ?? 0;
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    expense.forEach((c) => { m[`BUDGET|${c}`] = String(get("BUDGET", c) || ""); m[`SPENT|${c}`] = String(get("SPENT", c) || ""); });
    income.forEach((c) => { m[`INCOME|${c}`] = String(get("INCOME", c) || ""); });
    return m;
  });
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);
  const num = (k: string) => Number(vals[k]) || 0;
  const totBudget = expense.reduce((n, c) => n + num(`BUDGET|${c}`), 0);
  const totSpent = expense.reduce((n, c) => n + num(`SPENT|${c}`), 0);
  const totIncome = income.reduce((n, c) => n + num(`INCOME|${c}`), 0);
  const fmt = (n: number) => `PKR ${Math.round(n).toLocaleString("en-US")}`;

  async function save() {
    setMsg("");
    const body = { fiscalYear: year, entries: Object.entries(vals).map(([k, v]) => { const [kind, category] = k.split("|"); return { kind, category, amount: v === "" ? 0 : v }; }) };
    const res = await fetch("/api/chairman/finance", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    setOk(res.ok); setMsg(res.ok ? "Saved." : d.error || "Something went wrong");
    if (res.ok) router.refresh();
  }
  const cell = (k: string) => <input type="number" min={0} value={vals[k] ?? ""} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} style={{ width: 150, padding: "5px 8px", border: "1px solid var(--line)", textAlign: "right" }} />;

  return (
    <>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <label style={{ fontSize: 13 }}>Fiscal year (July to June){" "}
          <select value={year} onChange={(e) => router.push(`/chairman/finance?year=${e.target.value}`)} style={{ padding: "5px 8px" }}>{years.map((y) => <option key={y}>{y}</option>)}</select>
        </label>
        <a className="btn" href={`/api/chairman/finance/export?year=${year}`}>Download Excel ({year})</a>
        <ExcelImportButton endpoint="/api/chairman/finance/import" label={`Import ${year} from Excel`} fields={{ fiscalYear: year }} />
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        {[["Total budget", fmt(totBudget)], ["Spent so far", fmt(totSpent)], ["Budget used", totBudget > 0 ? `${Math.round((totSpent / totBudget) * 100)}%` : "—"], ["Income", fmt(totIncome)]].map(([l, v]) => (
          <div key={l} style={{ background: "var(--card)", border: "1px solid var(--line)", padding: "12px 18px", minWidth: 150 }}>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "Georgia, serif" }}>{v}</div><div style={{ fontSize: 11.5, color: "var(--slate)" }}>{l}</div>
          </div>
        ))}
      </div>
      {msg && <div className="card" style={{ color: ok ? "var(--sage)" : "#b3261e" }}>{msg}</div>}
      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Budget and spending, {year}</h3>
        <table>
          <thead><tr><th>Where the money goes</th><th style={{ textAlign: "right" }}>Budget (PKR)</th><th style={{ textAlign: "right" }}>Spent (PKR)</th><th style={{ minWidth: 160 }}>Used</th></tr></thead>
          <tbody>
            {expense.map((c) => {
              const b = num(`BUDGET|${c}`), s = num(`SPENT|${c}`), p = b > 0 ? Math.min(100, Math.round((s / b) * 100)) : 0;
              return (
                <tr key={c}><td>{c}</td><td style={{ textAlign: "right" }}>{cell(`BUDGET|${c}`)}</td><td style={{ textAlign: "right" }}>{cell(`SPENT|${c}`)}</td>
                  <td><div style={{ background: "#ECE8E0", borderRadius: 6, height: 10 }}><div style={{ width: `${p}%`, height: "100%", borderRadius: 6, background: s > b && b > 0 ? "#B3261E" : "#4f7d5a" }} /></div>
                    <span style={{ fontSize: 11, color: "var(--slate)" }}>{b > 0 ? `${Math.round((s / b) * 100)}%` : "no budget"}</span></td></tr>
              );
            })}
            <tr><td><b>Total</b></td><td style={{ textAlign: "right" }}><b>{fmt(totBudget)}</b></td><td style={{ textAlign: "right" }}><b>{fmt(totSpent)}</b></td><td></td></tr>
          </tbody>
        </table>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Income, {year}</h3>
        <table><tbody>
          {income.map((c) => <tr key={c}><td>{c}</td><td style={{ textAlign: "right" }}>{cell(`INCOME|${c}`)}</td></tr>)}
          <tr><td><b>Total income</b></td><td style={{ textAlign: "right" }}><b>{fmt(totIncome)}</b></td></tr>
        </tbody></table>
        <button className="btn btn-brass" style={{ marginTop: 12 }} onClick={save}>Save {year}</button>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Year by year</h3>
        <table>
          <thead><tr><th>Year</th><th style={{ textAlign: "right" }}>Budget</th><th style={{ textAlign: "right" }}>Spent</th><th style={{ textAlign: "right" }}>Lab equipment budget</th><th style={{ textAlign: "right" }}>Library budget</th><th style={{ textAlign: "right" }}>Income</th></tr></thead>
          <tbody>{years.map((y) => {
            const sum = (kind: string, cats: string[]) => cats.reduce((n, c) => n + get(kind, c, y), 0);
            return <tr key={y}><td>{y}</td><td style={{ textAlign: "right" }}>{fmt(sum("BUDGET", expense))}</td><td style={{ textAlign: "right" }}>{fmt(sum("SPENT", expense))}</td>
              <td style={{ textAlign: "right" }}>{fmt(get("BUDGET", "Laboratory equipment and upgrades", y))}</td><td style={{ textAlign: "right" }}>{fmt(get("BUDGET", "Library and digital resources", y))}</td><td style={{ textAlign: "right" }}>{fmt(sum("INCOME", income))}</td></tr>;
          })}</tbody>
        </table>
      </div>
    </>
  );
}
