import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/db";

// Fully public — no login. A prospective Chairman submits this once;
// a Super User reviews it under Manage Chairmen / Account Requests.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim();
  const institutionName = String(body.institutionName || "").trim();
  if (!name || !email || !institutionName) {
    return NextResponse.json({ error: "Name, email, and institution name are required." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "That doesn't look like a valid email address." }, { status: 400 });
  }

  const request = await prisma.accountRequest.create({
    data: { name, email, institutionName, phone: body.phone || null, message: body.message || null },
  });

  return NextResponse.json({ ok: true, id: request.id });
}
