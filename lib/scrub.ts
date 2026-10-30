// Personal data never leaves the app in logs or monitoring: CNICs are masked, and fields that carry names, contact
// details, marks or identity numbers are dropped. Shared by the server, the browser and the Sentry hooks.

/** A Pakistani CNIC: 13 digits, written 35202-1234567-3 or 3520212345673. */
export const CNIC_RE = /\b\d{5}-?\d{7}-?\d\b/g;

/** 35202-1234567-3 → 35202-•••••••-3 (shown to everyone except the Super Admin). */
export function maskCnic(v: string | null | undefined): string {
  if (!v) return "";
  const d = String(v).replace(/\D/g, "");
  if (d.length !== 13) return "•••••";
  return `${d.slice(0, 5)}-•••••••-${d.slice(12)}`;
}
/** The CNIC as stored for the Super Admin, masked for everyone else. */
export const cnicFor = (v: string | null | undefined, role: string) => (role === "SUPER_ADMIN" || role === "SUPER_USER" ? v || "" : maskCnic(v));

/** Masks every CNIC inside free text (log lines, error messages, URLs). */
export const scrubText = (s: string) => String(s ?? "").replace(CNIC_RE, (m) => maskCnic(m));

const PERSONAL = /^(cnic|nic|name|fullname|fathername|father_name|firstname|lastname|email|phone|mobile|address|dob|dateofbirth|password|passwordhash|token|marks|mark|score|scores|obtained|grade|gpa|cgpa|rollnumber|roll|guardian|answers|body|note|comment)$/i;

/** Deep copy with personal fields removed and CNICs masked in every string. */
export function scrubObject<T>(v: T, depth = 0): T {
  if (depth > 6 || v == null) return v;
  if (typeof v === "string") return scrubText(v) as unknown as T;
  if (Array.isArray(v)) return v.map((x) => scrubObject(x, depth + 1)) as unknown as T;
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = PERSONAL.test(k.replace(/[-\s]/g, "")) ? "[removed]" : scrubObject(x, depth + 1);
    return out as T;
  }
  return v;
}

/** A URL without its query string (query strings can carry search terms, roll numbers or tokens). */
export const scrubUrl = (u: string) => scrubText(String(u || "").split("?")[0]);

type SentryEventLike = {
  message?: string; request?: { data?: unknown; query_string?: unknown; cookies?: unknown; headers?: Record<string, string>; url?: string };
  user?: Record<string, unknown>; extra?: Record<string, unknown>; contexts?: Record<string, unknown>;
  exception?: { values?: { value?: string }[] }; breadcrumbs?: { message?: string; data?: Record<string, unknown> }[];
};
/** Sentry beforeSend: keeps the user id, role and institute only; no bodies, query strings, cookies or personal fields. */
export function scrubEvent<E extends SentryEventLike>(e: E): E {
  if (e.request) {
    delete e.request.data; delete e.request.query_string; delete e.request.cookies;
    if (e.request.headers) for (const h of Object.keys(e.request.headers)) if (/cookie|authorization|x-forwarded-for|x-real-ip/i.test(h)) delete e.request.headers[h];
    if (e.request.url) e.request.url = scrubUrl(e.request.url);
  }
  if (e.user) e.user = { id: e.user.id, ...(e.user.role ? { role: e.user.role } : {}), ...(e.user.institute ? { institute: e.user.institute } : {}) };
  if (e.message) e.message = scrubText(e.message);
  for (const x of e.exception?.values || []) if (x.value) x.value = scrubText(x.value);
  if (e.extra) e.extra = scrubObject(e.extra);
  if (e.contexts) e.contexts = scrubObject(e.contexts);
  for (const b of e.breadcrumbs || []) { if (b.message) b.message = scrubText(b.message); if (b.data) b.data = scrubObject(b.data); }
  return e;
}
