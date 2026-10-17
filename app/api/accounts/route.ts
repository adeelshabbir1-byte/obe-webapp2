import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { erpAccess, edb, post, ensureAccounts } from "../../../lib/erp";

// Accounting (Institute Head / Finance): add accounts, record manual (two-line) journal entries.
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const acc = await erpAccess(user);
  if (!acc.finance) return NextResponse.json({ error: "Only Finance keeps the accounts." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    await ensureAccounts(acc.chairmanId);
    if (b.action === "addAccount") {
      const code = String(b.code || "").trim().slice(0, 10), name = String(b.name || "").trim().slice(0, 80);
      if (!code || !name || !["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"].includes(b.type)) return NextResponse.json({ error: "Code, name and type are needed." }, { status: 400 });
      await edb.ledgerAccount.create({ data: { chairmanId: acc.chairmanId, code, name, type: b.type } });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "journal") {
      const amount = Math.round(Number(b.amount) * 100) / 100;
      if (!(amount > 0) || !b.debit || !b.credit || b.debit === b.credit) return NextResponse.json({ error: "Choose two different accounts and an amount." }, { status: 400 });
      const date = new Date(String(b.date || "") + "T00:00:00Z");
      await post(acc.chairmanId, user.id, String(b.memo || "Manual entry").slice(0, 200), [[String(b.debit), amount, 0], [String(b.credit), 0, amount]], "MANUAL", undefined, isNaN(date.getTime()) ? new Date() : date);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch { return NextResponse.json({ error: "Accounts are not set up yet — run prisma/migration_erp.sql." }, { status: 500 }); }
}
