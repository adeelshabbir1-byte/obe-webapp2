import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { withErrors } from "../../../../lib/apiHandler";

// The institute's attendance policy, kept by the OMC: the minimum %, how late and excused count, the "close to the
// minimum" margin, and the defaults of a QR attendance session. Fields left out keep their current value.
async function PUT_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "OMC") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!user.managedById) return NextResponse.json({ error: "no chairman on record for this account" }, { status: 400 });

  const body = await req.json();
  const data: Record<string, number | boolean> = {};
  const num = (k: string, min: number, max: number, label: string) => {
    if (body[k] === undefined || body[k] === null || body[k] === "") return null;
    const n = parseInt(body[k], 10);
    if (isNaN(n) || n < min || n > max) return `${label} must be between ${min} and ${max}`;
    data[k === "minPercentage" ? "minPercentage" : k] = n;
    return null;
  };
  const problem = num("minPercentage", 1, 100, "minimum %") || num("warnMarginPct", 0, 30, "the warning margin") || num("qrPresentMinutes", 1, 90, "minutes counted as present")
    || num("qrLateMinutes", 1, 180, "minutes until the session closes") || num("qrRotateSeconds", 10, 30, "seconds between QR changes");
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  for (const k of ["lateCountsPresent", "excusedExcluded"]) if (typeof body[k] === "boolean") data[k] = body[k];
  if (!Object.keys(data).length) return NextResponse.json({ error: "minimum % must be between 1 and 100" }, { status: 400 });

  const current = await prisma.attendanceThreshold.findUnique({ where: { chairmanId: user.managedById } });
  const present = (data.qrPresentMinutes as number) ?? current?.qrPresentMinutes ?? 10, late = (data.qrLateMinutes as number) ?? current?.qrLateMinutes ?? 25;
  if (late < present) return NextResponse.json({ error: "the session must stay open at least as long as the present window" }, { status: 400 });

  const threshold = await prisma.attendanceThreshold.upsert({
    where: { chairmanId: user.managedById },
    create: { chairmanId: user.managedById, ...data },
    update: data,
  });

  await writeAuditLog({
    actorUserId: user.id, action: "ATTENDANCE_THRESHOLD_SET", entityType: "AttendanceThreshold", entityId: threshold.id,
    metadata: data,
  });

  return NextResponse.json({ threshold });
}
export const PUT = withErrors(PUT_handler);
