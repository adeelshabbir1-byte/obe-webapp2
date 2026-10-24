import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { TEAM_HINT, saveTeam, deleteTeam, setMember, setRole } from "../../../../lib/platformTeam";

const str = (v: unknown, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) : "");

// POST { action: team | teamDelete | member | role } — the Super Admin sets up the platform team.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || user.role !== "SUPER_USER") return NextResponse.json({ error: "Only the Super Admin sets up the platform team." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    let message = "";
    if (b.action === "team") message = await saveTeam(user.id, b);
    else if (b.action === "teamDelete") message = await deleteTeam(user.id, str(b.id, 60));
    else if (b.action === "member") message = await setMember(user.id, str(b.teamId, 60), str(b.userId, 60), b.role ? str(b.role, 20) : null);
    else if (b.action === "role") message = await setRole(user.id, str(b.userId, 60), str(b.role, 30), b.on !== false);
    else return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    return NextResponse.json({ ok: true, message });
  } catch (e) {
    const m = (e as Error).message || "Failed.";
    return NextResponse.json({ error: /does not exist|relation|P2021/.test(m) ? TEAM_HINT : m }, { status: 400 });
  }
}
