import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { notifyUsers } from "../../../../lib/notifications";
import { rdb2, REC_HINT, DEGREES, eligibility, type Request as HiringReq } from "../../../../lib/recruitment";
import { withErrors } from "../../../../lib/apiHandler";

const MAX_CV = 3 * 1024 * 1024;
const s = (v: FormDataEntryValue | null, n = 300) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const nOf = (v: FormDataEntryValue | null) => Math.max(0, Math.min(60, Number(s(v)) || 0));

/** POST multipart — the public application form of an advertisement (no sign-in). One application per email. */
async function POST_handler(req: Request, { params }: { params: { token: string } }) {
  try {
    const ad = await rdb2.jobAdvert.findUnique({ where: { token: params.token } });
    if (!ad || ad.status !== "OPEN" || new Date(ad.closeAt) < new Date()) return NextResponse.json({ error: "This position is no longer open for applications." }, { status: 400 });
    const fd = await req.formData();
    const name = s(fd.get("name"), 120), email = s(fd.get("email"), 160).toLowerCase();
    if (name.length < 3 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "Give your full name and a valid email." }, { status: 400 });
    if (await rdb2.jobApplication.count({ where: { advertId: ad.id, email } })) return NextResponse.json({ error: "An application from this email has already been received." }, { status: 400 });
    const degree = DEGREES[s(fd.get("highestDegree"))] ? s(fd.get("highestDegree")) : "OTHER";
    const pubs = s(fd.get("publications"), 20000).split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((p) => p[0]).slice(0, 200)
      .map(([title, journal, year, cat, doi]) => ({ title: title.slice(0, 300), journal: (journal || "").slice(0, 200), year: Number(year) || null, category: /^w/i.test(cat || "") ? "W" : /^x/i.test(cat || "") ? "X" : /^y/i.test(cat || "") ? "Y" : "OTHER", doi: (doi || "").slice(0, 120) }));
    const exp = s(fd.get("experience"), 8000).split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((e) => e[0]).slice(0, 40)
      .map(([organisation, title, from, to]) => ({ organisation: organisation.slice(0, 200), title: (title || "").slice(0, 120), from: Number(from) || null, to: Number(to) || null }));
    const cv = fd.get("cv");
    if (!(cv instanceof File) || !cv.size) return NextResponse.json({ error: "Attach your CV (PDF or Word)." }, { status: 400 });
    if (cv.size > MAX_CV) return NextResponse.json({ error: "The CV is larger than 3 MB." }, { status: 400 });
    if (!/pdf|word|officedocument/.test(cv.type)) return NextResponse.json({ error: "Upload the CV as PDF or Word." }, { status: 400 });
    const data = { highestDegree: degree, teachingYears: nOf(fd.get("teachingYears")), postPhdYears: nOf(fd.get("postPhdYears")), publicationsJson: JSON.stringify(pubs) };
    const r = (await rdb2.hiringRequest.findUnique({ where: { id: ad.requestId } })) as HiringReq;
    const el = eligibility(r.designation, data);
    await rdb2.jobApplication.create({ data: { id: randomUUID(), advertId: ad.id, chairmanId: ad.chairmanId, name, email, phone: s(fd.get("phone"), 40) || null, degreeTitle: s(fd.get("degreeTitle"), 200) || null, university: s(fd.get("university"), 200) || null, degreeYear: Number(s(fd.get("degreeYear"))) || null, industryYears: nOf(fd.get("industryYears")), experienceJson: JSON.stringify(exp), cvName: cv.name.slice(0, 200), cvType: cv.type, cvData: Buffer.from(await cv.arrayBuffer()).toString("base64"), eligible: el.eligible, eligibilityJson: JSON.stringify(el.checks), ...data } });
    const n = await rdb2.jobApplication.count({ where: { advertId: ad.id } });
    if (n === 1 || n % 10 === 0) await notifyUsers([r.raisedById], { kind: "REQUEST", title: `${n} application(s) for ${ad.title}`, href: "/recruitment?tab=applications" });
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: /does not exist|Cannot read properties of undefined/.test(String(e)) ? REC_HINT : "Could not save the application. Please try again." }, { status: 400 }); }
}
export const POST = withErrors(POST_handler);
