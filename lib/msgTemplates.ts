// Editable alert templates in English and Urdu (Adeel prompt §5). Stored per institute as ScopedSetting
// "msg.tpl" = { lang: "en" | "ur" | "both", kinds: { KIND: { en, ur } } }. {title} and {body} are filled in; with no
// template the message is the title and body as before. Pure: no database here.
export type Tpl = { lang: "en" | "ur" | "both"; kinds: Record<string, { en?: string; ur?: string }> };
export const DEFAULT_UR: Record<string, string> = {
  LOW_ATTENDANCE: "محترم طالب علم، {title}۔ {body}",
  EXAM_TOMORROW: "یاد دہانی: کل امتحان ہے — {title}۔ {body}",
  RESULT: "نتیجہ جاری کر دیا گیا ہے: {title}۔ {body}",
  TUTORIAL: "آپ کے لیے اضافی کلاس (ٹیوٹوریل) رکھی گئی ہے: {title}۔ {body}",
  DEADLINE: "یاد دہانی: {title}۔ {body}",
};
export function parseTpl(s: string | null | undefined): Tpl { try { const t = JSON.parse(s || "{}"); return { lang: ["en", "ur", "both"].includes(t.lang) ? t.lang : "en", kinds: t.kinds || {} }; } catch { return { lang: "en", kinds: {} }; } }
const fill = (t: string, title: string, body: string) => t.replace(/\{title\}/g, title).replace(/\{body\}/g, body).replace(/\s+۔\s*$/, "").trim();
/** The message text for one alert kind. */
export function render(tpl: Tpl, kind: string, title: string, body: string) {
  const k = tpl.kinds[kind] || {};
  const en = k.en ? fill(k.en, title, body) : `${title}${body ? `\n${body}` : ""}`;
  const urT = k.ur || DEFAULT_UR[kind];
  const ur = urT ? fill(urT, title, body) : "";
  return tpl.lang === "ur" && ur ? ur : tpl.lang === "both" && ur ? `${en}\n\n${ur}` : en;
}
