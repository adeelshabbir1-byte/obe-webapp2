import { NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../lib/studentSession";
import { claimPayment, FEE_HINT } from "../../../../lib/feeClearance";
import { withErrors } from "../../../../lib/apiHandler";

// POST { invoiceId, method, reference, amount, paidOn } — "I have paid": Finance verifies it.
async function POST_handler(req: Request) {
  const st = await getAuthenticatedStudent();
  if (!st) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  try { await claimPayment(st, String(b.invoiceId || ""), String(b.method || ""), String(b.reference || ""), Number(b.amount) || 0, String(b.paidOn || "")); return NextResponse.json({ ok: true, message: "Sent to Finance for verification." }); }
  catch (e) { const m = (e as Error).message || ""; return NextResponse.json({ error: /paymentClaim|does not exist/.test(m) ? FEE_HINT : m }, { status: 400 }); }
}
export const POST = withErrors(POST_handler);
