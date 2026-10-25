import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { act } from "../../../lib/batchReview";

// One endpoint for the batch approval: submit · propose · opinion · withdraw/keep · endorse · finalise.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!body.batchId) return NextResponse.json({ error: "batchId is required." }, { status: 400 });
  const r = await act({ id: user.id, name: user.name, role: user.role }, String(body.batchId), body);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json(r);
}
