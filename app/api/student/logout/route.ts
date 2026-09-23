import { NextResponse } from "next/server";
import { destroyStudentSession } from "../../../../lib/studentSession";

export async function POST() {
  await destroyStudentSession();
  return NextResponse.json({ ok: true });
}
