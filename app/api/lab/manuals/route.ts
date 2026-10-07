import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { labAccessFor, LAB_FILE_OK } from "../../../../lib/labAccess";
import { uploadEvidenceFile } from "../../../../lib/evidenceValidation";
import { writeAuditLog } from "../../../../lib/audit";

const MAX_SIZE_BYTES = 15 * 1024 * 1024;

// Upload a Word lab manual (or a new version of it). The Lab Engineer and the lab's lead can both do this.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const form = await req.formData();
  const courseId = String(form.get("courseId") || "");
  const labNumber = parseInt(String(form.get("labNumber") || ""), 10);
  const title = String(form.get("title") || "").trim().slice(0, 150);
  const note = String(form.get("note") || "").trim().slice(0, 300);
  const file = form.get("file") as File | null;
  if (!courseId || !labNumber || labNumber < 1 || labNumber > 40) return NextResponse.json({ error: "choose the lab number (1-40)" }, { status: 400 });
  if (!file || file.size === 0) return NextResponse.json({ error: "choose a Word file" }, { status: 400 });
  if (!LAB_FILE_OK(file.name)) return NextResponse.json({ error: "the manual must be a Word file (.doc or .docx)" }, { status: 400 });
  if (file.size > MAX_SIZE_BYTES) return NextResponse.json({ error: "file exceeds the 15 MB limit" }, { status: 400 });

  const access = await labAccessFor(user, courseId);
  if (!access) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let fileUrl: string;
  try {
    fileUrl = await uploadEvidenceFile(Buffer.from(await file.arrayBuffer()), `labmanual-${file.name}`, file.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  } catch (err: any) {
    return NextResponse.json({ error: "Upload failed: " + err.message }, { status: 500 });
  }

  const manual = await prisma.labManual.upsert({
    where: { courseId_labNumber: { courseId, labNumber } },
    create: { courseId, labNumber, title: title || `Lab ${labNumber}` },
    update: title ? { title } : {},
  });
  const last = await prisma.labManualVersion.findFirst({ where: { manualId: manual.id }, orderBy: { version: "desc" } });
  const version = await prisma.labManualVersion.create({
    data: { manualId: manual.id, version: (last?.version || 0) + 1, fileName: file.name, fileUrl, uploadedById: user.id, note: note || null },
  });
  await writeAuditLog({ actorUserId: user.id, action: "LAB_MANUAL_UPLOADED", entityType: "LabManual", entityId: manual.id, metadata: { labNumber, version: version.version, as: access.as } });
  return NextResponse.json({ ok: true, version: version.version }, { status: 201 });
}
