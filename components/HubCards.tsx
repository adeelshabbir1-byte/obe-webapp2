"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMenu } from "./MenuContext";
import { hubsOf, HUBS } from "../lib/hubMenu";
import { iconsFor } from "../lib/cardIcons";
import { tr } from "../lib/i18n/ur";

// Six card states (queue item 9), each with its own mark so colour is never the only signal.
const TONE = { red: "#B3261E", amber: "#B26A00", blue: "#1B5FAA", green: "#1E6B3A", grey: "#8A939C" } as const;
const MARK = { red: "!", amber: "⚠", blue: "•", green: "✓", grey: "○" } as const;
const WORD = { red: "overdue", amber: "due soon", blue: "in progress", green: "done", grey: "not set up" } as const;
type St = keyof typeof TONE;
const NEEDS: St[] = ["red", "amber", "blue", "grey"];

// One hub of the short menu: every page of this area as a card in its group — one card design throughout (queue item 10):
// the same size, a chosen icon, the title on one line, the purpose on at most two lines, the state badge in one place.
export default function HubCards({ hubKey, about }: { hubKey: string; about: Record<string, string> }) {
  const { links, linkStatus, lang } = useMenu();
  const t = (x: string) => tr(lang, x);
  const [q, setQ] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const hub = HUBS.find((h) => h.key === hubKey);
  const sections = useMemo(() => hubsOf(links).get(hubKey) || [], [links, hubKey]);
  const needle = q.trim().toLowerCase();
  const stOf = (href: string) => linkStatus[href]?.status as St | undefined;
  const shown = sections.map((s) => ({ ...s, links: s.links.filter((l) => (!needle || `${l.label} ${about[l.href] || ""}`.toLowerCase().includes(needle)) && (!onlyMine || NEEDS.includes(stOf(l.href) as St))) })).filter((s) => s.links.length);
  const all = sections.flatMap((s) => s.links);
  const counts = all.reduce((a, l) => { const s = stOf(l.href); if (s) a[s] = (a[s] || 0) + 1; return a; }, {} as Partial<Record<St, number>>);
  const attention = all.filter((l) => stOf(l.href) === "red" || stOf(l.href) === "amber");
  return (
    <div dir={lang === "ur" ? "rtl" : undefined}>
      <style>{`.hc-card{display:flex;gap:10px;align-items:flex-start;padding:12px;margin:0;height:104px;box-sizing:border-box;text-decoration:none;color:inherit;border-top:3px solid transparent;overflow:hidden}
.hc-title{display:block;font-weight:700;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hc-text{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:12.5px;line-height:1.35;margin-top:3px;color:var(--slate,#5b6470)}
.hc-icon{flex:0 0 34px;height:34px;border-radius:9px;display:grid;place-items:center;background:rgba(27,95,170,.09);color:#1B5FAA}
.hc-badge{position:absolute;top:8px;right:8px;color:#fff;border-radius:9px;font-size:10.5px;font-weight:700;padding:0 6px;line-height:17px}
[dir=rtl] .hc-badge{right:auto;left:8px}`}</style>
      <div style={{ display: "flex", alignItems: "end", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <div style={{ flex: "1 1 260px" }}><h1 style={{ fontSize: 22, margin: 0 }}>{t(hub?.label || "Pages")}</h1><p className="small-note" style={{ margin: "2px 0 0" }}>{t(hub?.blurb || "")} {all.length} {t("pages.")}</p></div>
        {all.length > 8 && <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Find a page…")} aria-label="Find a page" style={{ width: 220 }} />}
      </div>
      {Object.keys(counts).length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 13, margin: "6px 0" }} data-hub-summary>
          {(["red", "amber", "blue", "green", "grey"] as St[]).filter((s) => counts[s]).map((s) => <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ background: TONE[s], color: "#fff", borderRadius: 9, padding: "0 6px", fontSize: 11, fontWeight: 700 }}>{MARK[s]}</span>{counts[s]} {WORD[s]}</span>)}
          <label style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} data-only-mine /> Show only what needs me</label>
        </div>
      )}
      {attention.length > 0 && !needle && !onlyMine && (
        <div className="card" style={{ borderLeft: `4px solid ${TONE.red}`, padding: "8px 12px", margin: "8px 0 4px" }}>
          <b style={{ fontSize: 13 }}>{t("Needs you now")}</b>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>{attention.map((l) => { const st = linkStatus[l.href]; return <Link key={l.href} href={l.href} prefetch={false} style={{ fontSize: 13 }} title={st.reasons.join(" · ")}>{t(l.label)} <span style={{ color: TONE[st.status as St] }}>({st.count || MARK[st.status as St]})</span></Link>; })}</div>
        </div>
      )}
      {shown.map((s) => {
        const icons = iconsFor(s.links);
        return (
          <section key={s.title} data-group={s.title} style={{ marginTop: 16, border: "1px solid rgba(27,95,170,.18)", borderRadius: 12, padding: "10px 12px 12px", background: "rgba(27,95,170,.035)" }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 8, paddingBottom: 6, borderBottom: "1px solid rgba(27,95,170,.15)" }}>{t(s.title)} <span className="small-note" style={{ fontWeight: 400 }}>{s.links.length}</span></h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
              {s.links.map((l) => {
                const Icon = icons.get(l.href)!; const st = linkStatus[l.href]; const k = st?.status as St | undefined;
                const why = st ? st.reasons.join(" · ") + (st.count > st.reasons.length ? ` · +${st.count - st.reasons.length} more` : "") : undefined;
                return (
                  <Link key={l.href} href={l.href} prefetch={false} className="card hc-card" title={why} data-state={k || "none"} style={{ position: "relative", borderTopColor: k ? TONE[k] : "transparent" }}>
                    <span className="hc-icon" aria-hidden="true"><Icon size={18} /></span>
                    <span style={{ minWidth: 0, flex: 1, paddingRight: k ? 30 : 0 }}>
                      <span className="hc-title">{t(l.label)}</span>
                      <span className="hc-text">{about[l.href] || ""}</span>
                    </span>
                    {k && <span className="hc-badge" style={{ background: TONE[k] }} aria-label={why}>{MARK[k]}{st && st.count ? ` ${st.count}` : ""}</span>}
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
      {!shown.length && <p className="small-note" style={{ marginTop: 16 }}>{needle ? t("No page matches.") : onlyMine ? "Nothing here needs you now ✓" : t("Nothing here for your role.")}</p>}
    </div>
  );
}
