"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMenu } from "./MenuContext";
import { hubsOf, HUBS } from "../lib/hubMenu";
import { getNavIcon } from "../lib/navIcons";
import { tr } from "../lib/i18n/ur";

const TONE = { red: "#B3261E", amber: "#B26A00", blue: "#1B5FAA" } as const;

// One hub of the short menu: every page of this area as a card, grouped, with its status and a one-line purpose.
export default function HubCards({ hubKey, about }: { hubKey: string; about: Record<string, string> }) {
  const { links, linkStatus, lang } = useMenu();
  const t = (x: string) => tr(lang, x);
  const [q, setQ] = useState("");
  const hub = HUBS.find((h) => h.key === hubKey);
  const sections = useMemo(() => hubsOf(links).get(hubKey) || [], [links, hubKey]);
  const needle = q.trim().toLowerCase();
  const shown = sections.map((s) => ({ ...s, links: s.links.filter((l) => !needle || `${l.label} ${about[l.href] || ""}`.toLowerCase().includes(needle)) })).filter((s) => s.links.length);
  const total = sections.reduce((a, s) => a + s.links.length, 0);
  const attention = sections.flatMap((s) => s.links).filter((l) => linkStatus[l.href]?.status === "red" || linkStatus[l.href]?.status === "amber");
  return (
    <div dir={lang === "ur" ? "rtl" : undefined}>
      <div style={{ display: "flex", alignItems: "end", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <div style={{ flex: "1 1 260px" }}><h1 style={{ fontSize: 22, margin: 0 }}>{t(hub?.label || "Pages")}</h1><p className="small-note" style={{ margin: "2px 0 0" }}>{t(hub?.blurb || "")} {total} {t("pages.")}</p></div>
        {total > 8 && <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Find a page…")} aria-label="Find a page" style={{ width: 220 }} />}
      </div>
      {attention.length > 0 && !needle && (
        <div className="card" style={{ borderLeft: `4px solid ${TONE.red}`, padding: "8px 12px", margin: "8px 0 4px" }}>
          <b style={{ fontSize: 13 }}>{t("Needs you now")}</b>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>{attention.map((l) => <Link key={l.href} href={l.href} prefetch={false} style={{ fontSize: 13 }}>{l.label} <span style={{ color: TONE[linkStatus[l.href].status] }}>({linkStatus[l.href].count})</span></Link>)}</div>
        </div>
      )}
      {shown.map((s) => (
        <section key={s.title} data-group={s.title} style={{ marginTop: 16, border: "1px solid rgba(27,95,170,.18)", borderRadius: 12, padding: "10px 12px 12px", background: "rgba(27,95,170,.035)" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 8, paddingBottom: 6, borderBottom: "1px solid rgba(27,95,170,.15)" }}>{t(s.title)} <span className="small-note" style={{ fontWeight: 400 }}>{s.links.length}</span></h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10 }}>
            {s.links.map((l) => {
              const Icon = getNavIcon(l.label); const st = linkStatus[l.href];
              return (
                <Link key={l.href} href={l.href} prefetch={false} className="card" title={st ? st.reasons.join(" · ") : undefined}
                  style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 12px", margin: 0, textDecoration: "none", color: "inherit", borderTop: st ? `3px solid ${TONE[st.status]}` : undefined, minHeight: 72 }}>
                  <span style={{ flex: "0 0 32px", height: 32, borderRadius: 8, display: "grid", placeItems: "center", background: "rgba(27,95,170,.09)" }}><Icon size={17} /></span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "flex", gap: 6, alignItems: "center" }}><b style={{ fontSize: 13.5 }}>{t(l.label)}</b>{st && <span style={{ background: TONE[st.status], color: "#fff", borderRadius: 9, fontSize: 10.5, fontWeight: 700, padding: "0 6px" }}>{st.count}</span>}</span>
                    {about[l.href] && <span className="small-note" style={{ display: "block", marginTop: 2, lineHeight: 1.35 }}>{about[l.href]}</span>}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
      {!shown.length && <p className="small-note" style={{ marginTop: 16 }}>{needle ? t("No page matches.") : t("Nothing here for your role.")}</p>}
    </div>
  );
}
