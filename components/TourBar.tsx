"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { TOUR_STEPS, TOUR_KEY } from "../lib/tourSteps";

// The floating Back / Next bar of the presentation tour (started from /tour). Hidden unless a tour is running.
export default function TourBar() {
  const router = useRouter();
  const path = usePathname();
  const [step, setStep] = useState<number | null>(null);
  useEffect(() => { try { const v = sessionStorage.getItem(TOUR_KEY); setStep(v === null ? null : Number(v)); } catch { setStep(null); } }, [path]);
  if (step === null || !TOUR_STEPS[step]) return null;
  const go = (n: number) => {
    if (n < 0 || n >= TOUR_STEPS.length) { try { sessionStorage.removeItem(TOUR_KEY); } catch { /* ignore */ } setStep(null); return; }
    try { sessionStorage.setItem(TOUR_KEY, String(n)); } catch { /* ignore */ }
    setStep(n); router.push(TOUR_STEPS[n].href);
  };
  const s = TOUR_STEPS[step];
  return (
    <div className="no-print" style={{ position: "fixed", left: "50%", bottom: 16, transform: "translateX(-50%)", zIndex: 200, width: "min(680px, calc(100vw - 32px))", background: "#3A1218", color: "#fff", borderRadius: 12, padding: "12px 16px", boxShadow: "0 8px 30px rgba(0,0,0,.25)" }}>
      <div style={{ fontSize: 11, opacity: 0.75 }}>Tour · step {step + 1} of {TOUR_STEPS.length}</div>
      <div style={{ fontWeight: 700, fontSize: 15, margin: "2px 0" }}>{s.title}</div>
      <div style={{ fontSize: 13, lineHeight: 1.4 }}>{s.text}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
        <button className="btn btn-secondary btn-sm" onClick={() => go(-1)}>End tour</button>
        {step > 0 && <button className="btn btn-secondary btn-sm" onClick={() => go(step - 1)}>← Back</button>}
        <button className="btn btn-brass btn-sm" onClick={() => go(step + 1 >= TOUR_STEPS.length ? -1 : step + 1)}>{step + 1 >= TOUR_STEPS.length ? "Finish" : "Next →"}</button>
      </div>
    </div>
  );
}
