import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "CHAIRMAN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const config = await prisma.aiConfig.findUnique({ where: { chairmanId: user.id } });
  if (!config?.apiKey) {
    return NextResponse.json({ error: "no API key saved yet — enter one and save before testing" }, { status: 400 });
  }

  let ok = false, note = "";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: config.model, max_tokens: 10, messages: [{ role: "user", content: "Reply with just: OK" }] }),
    });
    if (res.ok) {
      ok = true; note = "Connected successfully.";
    } else {
      const text = await res.text().catch(() => "");
      note = `API returned ${res.status}: ${text.slice(0, 300)}`;
    }
  } catch (err: any) {
    note = "Request failed: " + err.message;
  }

  await prisma.aiConfig.update({ where: { chairmanId: user.id }, data: { lastTestedAt: new Date(), lastTestOk: ok, lastTestNote: note } });

  return NextResponse.json({ ok, note });
}
