import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/db";

// Fully public — no login. A prospective Institute Head submits this once;
// a Super User reviews it under Manage Institute Heads / Account Requests.
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

  if (name.length > 120 || email.length > 160 || institutionName.length > 200) return NextResponse.json({ error: "One of the fields is too long." }, { status: 400 });
  const phone = body.phone ? String(body.phone).slice(0, 40) : null;
  const message = body.message ? String(body.message).slice(0, 2000) : null;

  // This form is public, so stop it being used to flood the Super User's inbox: 3 requests per email per day.
  const recent = await prisma.accountRequest.count({ where: { email, createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } } });
  if (recent >= 3) return NextResponse.json({ error: "We already have your request. We will be in touch." }, { status: 429 });

  const request = await prisma.accountRequest.create({
    data: { name, email, institutionName, phone, message },
  });

  return NextResponse.json({ ok: true, id: request.id });
}
