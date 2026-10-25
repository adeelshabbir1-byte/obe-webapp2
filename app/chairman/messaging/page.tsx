import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { ActionForm } from "../../../components/fyp/FypClient";
import MessagingTools from "../../../components/MessagingTools";
import { xdb, configOf, mask, ALERT_KINDS } from "../../../lib/messaging";
import { itAccess } from "../../../lib/itManager";

export const dynamic = "force-dynamic";

// Institute Head: SMS and WhatsApp gateways, which alerts go out, broadcast, and the send log.
export default async function MessagingPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const it = await itAccess(user);
  if (!it) redirect("/home");
  const cid = it.chairmanId;
  const shell = (c: React.ReactNode) => <Shell roleLabel="Institute Head" userName={user.name} navLinks={navForRole(user.role)}><h1 style={{ fontSize: 22, marginBottom: 4 }}>SMS &amp; WhatsApp</h1>{!it.canAct && <div className="card" style={{ borderLeft: "5px solid #1565C0", padding: "8px 12px", fontSize: 13 }}><b>Read-only.</b> {it.manager?.name} is the IT Manager and runs this page.</div>}{c}</Shell>;
  let c; try { c = await configOf(cid); await xdb.messageLog.count({ where: { chairmanId: cid } }); } catch { return shell(<div className="err">Run prisma/migration_messaging.sql first.</div>); }
  const sms = (() => { try { return JSON.parse(c?.smsJson || "{}"); } catch { return {}; } })() as Record<string, string>;
  const wa = (() => { try { return JSON.parse(c?.waJson || "{}"); } catch { return {}; } })() as Record<string, string>;
  const kinds = (() => { try { return JSON.parse(c?.kindsJson || "[]") as string[]; } catch { return []; } })();
  const log = (await xdb.messageLog.findMany({ where: { chairmanId: cid }, orderBy: { createdAt: "desc" }, take: 60 })) as { channel: string; to: string; body: string; status: string; error: string | null; kind: string | null; createdAt: Date }[];
  const since = new Date(); since.setHours(0, 0, 0, 0);
  const today = log.filter((l) => l.createdAt >= since).length;
  const batches = await prisma.batch.findMany({ where: { coordinator: { managedById: cid } }, select: { id: true, degreeProgram: true, batchName: true }, orderBy: [{ degreeProgram: "asc" }, { startYear: "desc" }] });
  const contacts = (await xdb.studentContact.count({ where: { phone: { not: null } } }).catch(() => 0)) as number;
  const audiences: [string, string][] = [["role:ALL", "All staff"], ["role:INSTRUCTOR", "Instructors"], ["role:PROGRAM_COORDINATOR", "Program Leads"], ["role:HEAD_OF_DEPARTMENT", "Chairmen"], ...batches.map((b) => [`batch:${b.id}`, `Students — ${b.degreeProgram} ${b.batchName}`] as [string, string])];
  return shell(<>
    <p className="small-note">Alerts reach people on WhatsApp (where set up) or SMS. Staff numbers come from each person&apos;s profile; students enter theirs in the portal or you import them. {contacts} students have a number on file. Today: {today}/{c?.dailyLimit ?? 500} messages.</p>
    <div className="card">
      <ActionForm url="/api/messaging" fixed={{ action: "save" }} submit="Save settings" initial={{
        waProvider: c?.waProvider || "NONE", wa_phoneNumberId: wa.phoneNumberId || "", wa_template: wa.template || "obehub_alert", wa_lang: wa.lang || "en", wa_sid: wa.sid || "", wa_from: wa.from || "",
        smsProvider: c?.smsProvider || "NONE", sms_sid: sms.sid || "", sms_from: sms.from || "", sms_url: sms.url || "", sms_method: sms.method || "GET", sms_body: sms.body || "", sms_localFormat: sms.localFormat || "no", sms_failIf: sms.failIf || "",
        dailyLimit: c?.dailyLimit ?? 500, ...Object.fromEntries(ALERT_KINDS.map(([k]) => [`kind_${k}`, kinds.includes(k)])) }}
        fields={[
          { name: "waProvider", label: "WhatsApp", type: "select", options: [["NONE", "Off"], ["META", "Meta WhatsApp Cloud API"], ["TWILIO", "Twilio WhatsApp"]] },
          { name: "wa_phoneNumberId", label: "Meta phone number ID", width: 170 }, { name: "wa_token", label: `Access token ${mask(wa.token)}`, width: 200, placeholder: "leave blank to keep" },
          { name: "wa_template", label: "Approved template name (2 text parameters)", width: 200 }, { name: "wa_lang", label: "Template language", width: 80 },
          { name: "wa_sid", label: "Twilio account SID", width: 200 }, { name: "wa_from", label: "Twilio WhatsApp number (+92…)", width: 160 },
          { name: "smsProvider", label: "SMS", type: "select", options: [["NONE", "Off"], ["HTTP", "Pakistani bulk-SMS gateway (HTTP API)"], ["TWILIO", "Twilio SMS"]] },
          { name: "sms_url", label: "Gateway URL with {to} and {message}", full: true, placeholder: "https://api.yourgateway.pk/send?key=XXXX&mask=UNI&to={to}&msg={message}" },
          { name: "sms_method", label: "Method", type: "select", options: [["GET", "GET"], ["POST", "POST (body below)"]] }, { name: "sms_body", label: "POST body (optional, same placeholders)", width: 260 },
          { name: "sms_localFormat", label: "Number format", type: "select", options: [["no", "923001234567"], ["yes", "03001234567"]] }, { name: "sms_failIf", label: "Treat reply containing this as failure", width: 160 },
          { name: "sms_sid", label: "Twilio SID (SMS)", width: 200 }, { name: "sms_token", label: `Twilio auth token ${mask(sms.token)}`, width: 200, placeholder: "leave blank to keep" }, { name: "sms_from", label: "Twilio sender number", width: 150 },
          { name: "dailyLimit", label: "Daily limit", type: "number", width: 90 },
          ...ALERT_KINDS.map(([k, v]) => ({ name: `kind_${k}`, label: v, type: "checkbox" as const })),
        ]} />
      <p className="small-note">Meta WhatsApp: create a template in WhatsApp Manager with body like “OBEHUB: {"{{1}}"} — {"{{2}}"}” and use its name here. Business-started WhatsApp messages must use an approved template.</p>
    </div>
    <MessagingTools audiences={audiences} />
    <div className="card" style={{ overflowX: "auto" }}><h3 style={{ marginTop: 0 }}>Recent messages</h3>
      <table><thead><tr><th>When</th><th>Channel</th><th>To</th><th>Message</th><th>Status</th></tr></thead>
        <tbody>{log.map((l, i) => <tr key={i}><td style={{ fontSize: 12 }}>{l.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td><td>{l.channel}</td><td>{l.to.replace(/\d{4}$/, "••••")}</td><td style={{ fontSize: 12, maxWidth: 320 }}>{l.body.slice(0, 120)}</td><td style={{ color: l.status === "SENT" ? "#1F5E36" : "#B3261E", fontSize: 12 }}>{l.status}{l.error ? `: ${l.error.slice(0, 120)}` : ""}</td></tr>)}</tbody></table>
      {!log.length && <p className="small-note">Nothing sent yet.</p>}
    </div>
  </>);
}
