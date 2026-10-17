import { NextResponse } from "next/server";
import { getSignedInUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";

export const dynamic = "force-dynamic";
const xdb = prisma as unknown as Record<string, any>;

// PUT { pins: string[] } saves the person's pinned menu links; { pins: null } goes back to the role's default list.
export async function PUT(req: Request) {
  const user = await getSignedInUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.pins === null) { await xdb.userNavPref.deleteMany({ where: { userId: user.id } }); return NextResponse.json({ ok: true }); }
    const pins = Array.isArray(b.pins) ? Array.from(new Set(b.pins.filter((x: unknown) => typeof x === "string" && x.startsWith("/")))).slice(0, 20) : [];
    await xdb.userNavPref.upsert({ where: { userId: user.id }, create: { userId: user.id, pinsJson: JSON.stringify(pins) }, update: { pinsJson: JSON.stringify(pins) } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Pins are not set up yet — the Super User needs to run prisma/migration_nav_pins.sql." }, { status: 500 });
  }
}
