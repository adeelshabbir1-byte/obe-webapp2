import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { BLOOD_GROUPS } from "../../../lib/facultyProfile";

// A faculty member reads and saves only their own profile.
const ownerId = (u: { id: string }) => (u as { realUserId?: string }).realUserId || u.id;
const str = (v: unknown, max = 300) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const date = (v: unknown) => { if (typeof v !== "string" || !v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d; };

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const id = ownerId(user);
  const [profile, records] = await Promise.all([
    prisma.facultyProfile.findUnique({ where: { userId: id } }),
    prisma.facultyRecord.findMany({ where: { userId: id }, orderBy: [{ startYear: "desc" }, { createdAt: "desc" }] }),
  ]);
  return NextResponse.json({ profile, records });
}

export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (b.bloodGroup && !BLOOD_GROUPS.includes(b.bloodGroup)) return NextResponse.json({ error: "choose a valid blood group" }, { status: 400 });
  let photo: string | null | undefined = undefined;
  if (b.photo === null || b.photo === "") photo = null;
  else if (typeof b.photo === "string") {
    if (!b.photo.startsWith("data:image/") || b.photo.length > 400_000) return NextResponse.json({ error: "the picture is too large - choose a smaller one" }, { status: 400 });
    photo = b.photo;
  }
  const data = {
    designation: str(b.designation, 80), employmentType: str(b.employmentType, 40), dateOfJoining: date(b.dateOfJoining), dateOfBirth: date(b.dateOfBirth),
    gender: str(b.gender, 20), bloodGroup: str(b.bloodGroup, 5), phone: str(b.phone, 40), address: str(b.address, 500),
    nextOfKinName: str(b.nextOfKinName, 120), nextOfKinRelation: str(b.nextOfKinRelation, 60), nextOfKinPhone: str(b.nextOfKinPhone, 40), nextOfKinAddress: str(b.nextOfKinAddress, 500),
    ...(photo !== undefined ? { photo } : {}),
  };
  const id = ownerId(user);
  const profile = await prisma.facultyProfile.upsert({ where: { userId: id }, create: { userId: id, ...data }, update: data });
  return NextResponse.json({ ok: true, profile });
}
