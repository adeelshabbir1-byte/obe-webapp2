import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { TEAM_HINT, saveTeam, deleteTeam, setMember, setRole, addStarterTeams } from "../../../../lib/platformTeam";
import { withErrors } from "../../../../lib/apiHandler";

const str = (v: unknown, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) : "");

// POST { action: team | teamDelete | member | role } — the Super Admin sets up the platform team.
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || user.role !== "SUPER_USER") return NextResponse.json({ error: "Only the Super Admin sets up the platform team." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    let message = "";
    if (b.action === "team") message = await saveTeam(user.id, b);
    else if (b.action === "starterTeams") message = await addStarterTeams(user.id);
    else if (b.action === "teamDelete") message = await deleteTeam(user.id, str(b.id, 60));
    else if (b.action === "member") message = await setMember(user.id, str(b.teamId, 60), str(b.userId, 60), b.role ? str(b.role, 20) : null);
    else if (b.action === "role") message = await setRole(user.id, str(b.userId, 60), str(b.role, 30), b.on !== false);
    else if (b.action === "resetLogin") { const temp = await (await import("../../../../lib/platformTeam")).resetMemberLogin(user.id, str(b.userId, 60), { twoStep: !!b.twoStep }); return NextResponse.json({ ok: true, message: `Temporary password: ${temp} — give it to the person; they must change it at the next sign-in.` }); }
    else if (b.action === "resetTwoStep") { await (await import("../../../../lib/platformTeam")).resetMemberTwoStep(user.id, str(b.userId, 60)); message = "Two-step sign-in turned off; they set it up again at the next sign-in."; }
    else if (b.action === "active") { await (await import("../../../../lib/platformTeam")).setMemberActive(user.id, str(b.userId, 60), b.on !== false); message = b.on !== false ? "Account switched on." : "Account switched off and signed out."; }
    else return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    return NextResponse.json({ ok: true, message });
  } catch (e) {
    const m = (e as Error).message || "Failed.";
    return NextResponse.json({ error: /does not exist|relation|P2021/.test(m) ? TEAM_HINT : m }, { status: 400 });
  }
}
export const POST = withErrors(POST_handler);
