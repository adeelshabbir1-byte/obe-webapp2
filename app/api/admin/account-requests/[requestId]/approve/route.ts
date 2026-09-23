import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAuthenticatedUser } from "../../../../../../lib/session";
import { prisma } from "../../../../../../lib/db";
import { hashPassword } from "../../../../../../lib/auth";
import { cloneGrandCurriculaForChairman } from "../../../../../../lib/cloneCurriculum";
import { writeAuditLog } from "../../../../../../lib/audit";

function slugifyUsername(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "") || "chairman";
}

// Creates the Chairman account and clones the grand curriculum for
// them in one step — the two things a Super User previously had to do
// separately (create the account by hand, then run a SQL script) now
// happen together automatically on approval.
export async function POST(req: NextRequest, { params }: { params: { requestId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const request = await prisma.accountRequest.findUnique({ where: { id: params.requestId } });
  if (!request) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (request.status !== "PENDING") return NextResponse.json({ error: `already ${request.status.toLowerCase()}` }, { status: 400 });

  const existingEmail = await prisma.user.findUnique({ where: { email: request.email } });
  if (existingEmail) return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });

  // Base the username on the requester's own name, disambiguating with
  // a numeric suffix if it's already taken.
  let username = slugifyUsername(request.name);
  let suffix = 1;
  while (await prisma.user.findUnique({ where: { username } })) {
    suffix++;
    username = `${slugifyUsername(request.name)}${suffix}`;
  }

  const initialPassword = crypto.randomBytes(9).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
  const passwordHash = await hashPassword(initialPassword);

  const chairman = await prisma.user.create({
    data: {
      email: request.email, username, passwordHash, name: request.name, role: "CHAIRMAN",
      managedById: user.id, mustChangePassword: true,
    },
  });

  const clonedCurriculumIds = await cloneGrandCurriculaForChairman(chairman.id);

  await prisma.accountRequest.update({
    where: { id: request.id },
    data: { status: "APPROVED", reviewedById: user.id, reviewedAt: new Date(), createdChairmanId: chairman.id },
  });

  await writeAuditLog({
    actorUserId: user.id, action: "ACCOUNT_REQUEST_APPROVED", entityType: "User", entityId: chairman.id,
    metadata: { requestId: request.id, institutionName: request.institutionName, clonedCurricula: clonedCurriculumIds.length },
  });

  // The only place this initial password is ever visible — there's no
  // email-sending set up in this app, so the Super User has to relay it
  // to the new Chairman directly (same as any other manually-created
  // account); it's never stored or shown again after this response.
  return NextResponse.json({
    chairman: { id: chairman.id, name: chairman.name, username, initialPassword },
    clonedCurricula: clonedCurriculumIds.length,
  });
}
