import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../../../lib/session";
import { prisma } from "../../../../../../../../lib/db";
import { requireOwnedCourse } from "../../../../../../../../lib/subjectExpertGuard";
import { uploadEvidenceFile, validateEvidence } from "../../../../../../../../lib/evidenceValidation";
import { writeAuditLog } from "../../../../../../../../lib/audit";
import { withErrors } from "../../../../../../../../lib/apiHandler";

const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

// Uploads a rubric/paper/project as evidence for this instrument, then
// runs the DotAI-style check (AI if configured, deterministic fallback
// otherwise) against every CLO the instrument covers.
async function POST_handler(req: NextRequest, { params }: { params: { courseId: string; instrumentId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const instrument = await prisma.assessmentInstrument.findUnique({ where: { id: params.instrumentId } });
  if (!instrument || instrument.courseId !== course.id) return NextResponse.json({ error: "instrument not found" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "file is required" }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "file is empty" }, { status: 400 });
  if (file.size > MAX_SIZE_BYTES) return NextResponse.json({ error: "file exceeds 15 MB limit" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  let fileUrl: string;
  try {
    fileUrl = await uploadEvidenceFile(buffer, file.name, file.type || "application/octet-stream");
  } catch (err: any) {
    return NextResponse.json({ error: "Upload failed: " + err.message }, { status: 500 });
  }

  const evidence = await prisma.instrumentEvidence.create({
    data: { instrumentId: instrument.id, fileName: file.name, fileUrl, uploadedByUserId: user.id, status: "PENDING" },
  });

  // Run validation inline — evidence files are small (15 MB cap) and
  // this keeps the result available on the same request rather than
  // needing the client to poll.
  await validateEvidence(evidence.id, buffer, file.type || "application/octet-stream");

  await writeAuditLog({ actorUserId: user.id, action: "INSTRUMENT_EVIDENCE_UPLOADED", entityType: "InstrumentEvidence", entityId: evidence.id, metadata: { instrumentId: instrument.id, fileName: file.name } });

  const updated = await prisma.instrumentEvidence.findUnique({ where: { id: evidence.id } });
  return NextResponse.json({ evidence: updated }, { status: 201 });
}

async function GET_handler(req: NextRequest, { params }: { params: { courseId: string; instrumentId: string } }) {
  const user = await getAuthenticatedUser();
  const course = await requireOwnedCourse(user, params.courseId);
  if (!course || !user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const evidence = await prisma.instrumentEvidence.findMany({ where: { instrumentId: params.instrumentId }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ evidence });
}
export const POST = withErrors(POST_handler);
export const GET = withErrors(GET_handler);
