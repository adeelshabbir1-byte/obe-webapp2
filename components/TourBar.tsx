"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { TOUR_CATALOGUE, TOUR_KEY, TOUR_STEPS_KEY, type TourStep } from "../lib/tourSteps";

// The floating Back / Next bar of the presentation tour (started from /tour). Hidden unless a tour is running.
// Steps come from the tour start (only screens the person's role can open); if a step still lands elsewhere, it says so.
export default function TourBar() {
  const router = useRouter();
  const path = usePathname();
  const [step, setStep] = useState<number | null>(null);
  const [steps, setSteps] = useState<TourStep[]>(TOUR_CATALOGUE);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    try {
      const v = sessionStorage.getItem(TOUR_KEY); setStep(v === null ? null : Number(v));
      const s = sessionStorage.getItem(TOUR_STEPS_KEY); if (s) setSteps(JSON.parse(s) as TourStep[]);
    } catch { setStep(null); }
    setPending(false);
  }, [path]);
  if (step === null || !steps[step]) return null;
  const go = (n: number) => {
    if (n < 0 || n >= steps.length) { try { sessionStorage.removeItem(TOUR_KEY); sessionStorage.removeItem(TOUR_STEPS_KEY); } catch { /* ignore */ } setStep(null); return; }
    try { sessionStorage.setItem(TOUR_KEY, String(n)); } catch { /* ignore */ }
    setStep(n); setPending(true); router.push(steps[n].href);
  };
  const s = steps[step];
  const elsewhere = !pending && path !== s.href && !path.startsWith(`${s.href}/`);
  return (
    <div className="no-print" style={{ position: "fixed", left: "50%", bottom: 16, transform: "translateX(-50%)", zIndex: 200, width: "min(680px, calc(100vw - 32px))", background: "#3A1218", color: "#fff", borderRadius: 12, padding: "12px 16px", boxShadow: "0 8px 30px rgba(0,0,0,.25)" }}>
      <div style={{ fontSize: 11, opacity: 0.75 }}>Tour · step {step + 1} of {steps.length}</div>
      <div style={{ fontWeight: 700, fontSize: 15, margin: "2px 0" }}>{s.title}</div>
      <div style={{ fontSize: 13, lineHeight: 1.4 }}>{s.text}</div>
      {elsewhere && <div style={{ fontSize: 12, marginTop: 4, color: "#FFD9A8" }}>This screen did not open for your sign-in (it belongs to another role). Press Next to continue, or <a href={s.href} style={{ color: "#FFD9A8", textDecoration: "underline" }}>try again</a>.</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
        <button className="btn btn-secondary btn-sm" onClick={() => go(-1)}>End tour</button>
        {step > 0 && <button className="btn btn-secondary btn-sm" onClick={() => go(step - 1)}>← Back</button>}
        <button className="btn btn-brass btn-sm" onClick={() => go(step + 1 >= steps.length ? -1 : step + 1)}>{step + 1 >= steps.length ? "Finish" : "Next →"}</button>
      </div>
    </div>
  );
}
