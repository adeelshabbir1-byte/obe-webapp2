"use client";
import { useRouter } from "next/navigation";
import { TOUR_STEPS, TOUR_KEY } from "../../lib/tourSteps";

export default function TourStart() {
  const router = useRouter();
  const start = () => { try { sessionStorage.setItem(TOUR_KEY, "0"); } catch { /* ignore */ } router.push(TOUR_STEPS[0].href); };
  return (
    <div style={{ maxWidth: 620, margin: "60px auto", padding: 24, background: "#fff", borderRadius: 12, border: "1px solid #E6DADC" }}>
      <h1 style={{ fontSize: 22, marginTop: 0 }}>Presentation tour</h1>
      <p style={{ fontSize: 14 }}>A guided walk through {TOUR_STEPS.length} key screens with a short explanation on each. Best signed in as a Program Lead (in the demo institute: <b>dream.lead.cs</b>).</p>
      <ol style={{ fontSize: 13.5 }}>{TOUR_STEPS.map((s) => <li key={s.href}>{s.title}</li>)}</ol>
      <button className="btn" onClick={start}>Start the tour</button>
    </div>
  );
}
