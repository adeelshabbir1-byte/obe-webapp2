import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { homeTag, refreshTag } from "../../../lib/pageCache";

// Item 23 (speed): drop the kept home-page figures so the next visit works them out from today's data.
export const dynamic = "force-dynamic";
export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  refreshTag(homeTag(user.role === "CHAIRMAN" ? user.id : user.managedById || "none"));
  return NextResponse.json({ ok: true });
}
