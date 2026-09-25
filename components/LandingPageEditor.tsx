"use client";

import { useState } from "react";
import Link from "next/link";

type Feature = { title: string; description: string };
type Testimonial = { quote: string; author: string };
type Content = {
  headline: string; subheadline: string; aboutText: string; missionText: string;
  contactEmail: string | null; contactPhone: string | null; pricingNote: string;
  featuresJson: string; testimonialsJson: string;
};

export default function LandingPageEditor({ initial }: { initial: Content }) {
  const [headline, setHeadline] = useState(initial.headline);
  const [subheadline, setSubheadline] = useState(initial.subheadline);
  const [aboutText, setAboutText] = useState(initial.aboutText);
  const [missionText, setMissionText] = useState(initial.missionText);
  const [contactEmail, setContactEmail] = useState(initial.contactEmail || "");
  const [contactPhone, setContactPhone] = useState(initial.contactPhone || "");
  const [pricingNote, setPricingNote] = useState(initial.pricingNote);
  const [features, setFeatures] = useState<Feature[]>(JSON.parse(initial.featuresJson || "[]"));
  const [testimonials, setTestimonials] = useState<Testimonial[]>(JSON.parse(initial.testimonialsJson || "[]"));
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState("");

  function updateFeature(i: number, field: keyof Feature, value: string) {
    setFeatures((prev) => prev.map((f, idx) => (idx === i ? { ...f, [field]: value } : f)));
  }
  function updateTestimonial(i: number, field: keyof Testimonial, value: string) {
    setTestimonials((prev) => prev.map((t, idx) => (idx === i ? { ...t, [field]: value } : t)));
  }

  async function save() {
    setLoading(true); setError(""); setOk(false);
    try {
      const res = await fetch("/api/admin/landing-page", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headline, subheadline, aboutText, missionText, contactEmail, contactPhone, pricingNote, features, testimonials }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setOk(true); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <>
      {error && <div className="err">{error}</div>}
      {ok && <div style={{ background: "#E3F8EF", color: "var(--sage)", padding: "8px 12px", fontSize: 12.5, marginBottom: 12 }}>Saved. <Link href="/" target="_blank" style={{ color: "var(--sage)" }}>View the live page →</Link></div>}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Hero</h3>
        <div className="field"><label>Headline</label><input value={headline} onChange={(e) => setHeadline(e.target.value)} /></div>
        <div className="field"><label>Subheadline</label><textarea value={subheadline} onChange={(e) => setSubheadline(e.target.value)} rows={2} style={{ width: "100%", padding: 8, border: "1px solid var(--line)" }} /></div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>About & Mission (optional — leave blank to hide either section)</h3>
        <div className="field"><label>About</label><textarea value={aboutText} onChange={(e) => setAboutText(e.target.value)} rows={4} style={{ width: "100%", padding: 8, border: "1px solid var(--line)" }} /></div>
        <div className="field"><label>Mission</label><textarea value={missionText} onChange={(e) => setMissionText(e.target.value)} rows={4} style={{ width: "100%", padding: 8, border: "1px solid var(--line)" }} /></div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Features</h3>
        {features.map((f, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input value={f.title} onChange={(e) => updateFeature(i, "title", e.target.value)} placeholder="Title" style={{ width: 200, padding: 8, border: "1px solid var(--line)" }} />
            <textarea value={f.description} onChange={(e) => updateFeature(i, "description", e.target.value)} placeholder="Description" rows={2} style={{ flex: 1, padding: 8, border: "1px solid var(--line)" }} />
            <button type="button" onClick={() => setFeatures((prev) => prev.filter((_, idx) => idx !== i))} style={{ background: "none", border: "none", color: "var(--rust)", cursor: "pointer" }}>Remove</button>
          </div>
        ))}
        <button type="button" onClick={() => setFeatures((prev) => [...prev, { title: "", description: "" }])} style={{ background: "none", border: "1px dashed var(--line)", padding: "4px 10px", fontSize: 11.5, cursor: "pointer" }}>+ Add Feature</button>
        {features.length === 0 && <p style={{ fontSize: 11, color: "var(--slate)", marginTop: 8 }}>None set — the page will show a sensible built-in default list until you add your own.</p>}
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Testimonials (optional)</h3>
        {testimonials.map((t, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <textarea value={t.quote} onChange={(e) => updateTestimonial(i, "quote", e.target.value)} placeholder="Quote" rows={2} style={{ flex: 1, padding: 8, border: "1px solid var(--line)" }} />
            <input value={t.author} onChange={(e) => updateTestimonial(i, "author", e.target.value)} placeholder="Author, Institution" style={{ width: 200, padding: 8, border: "1px solid var(--line)" }} />
            <button type="button" onClick={() => setTestimonials((prev) => prev.filter((_, idx) => idx !== i))} style={{ background: "none", border: "none", color: "var(--rust)", cursor: "pointer" }}>Remove</button>
          </div>
        ))}
        <button type="button" onClick={() => setTestimonials((prev) => [...prev, { quote: "", author: "" }])} style={{ background: "none", border: "1px dashed var(--line)", padding: "4px 10px", fontSize: 11.5, cursor: "pointer" }}>+ Add Testimonial</button>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Pricing Note (optional)</h3>
        <textarea value={pricingNote} onChange={(e) => setPricingNote(e.target.value)} rows={3} style={{ width: "100%", padding: 8, border: "1px solid var(--line)" }} placeholder="e.g. Pricing is per institution, based on enrolled students. Contact us for a quote." />
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Contact</h3>
        <div style={{ display: "flex", gap: 14 }}>
          <div className="field" style={{ flex: 1 }}><label>Email</label><input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} type="email" /></div>
          <div className="field" style={{ flex: 1 }}><label>Phone</label><input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} /></div>
        </div>
      </div>

      <button onClick={save} disabled={loading} className="btn btn-brass">{loading ? "Saving…" : "Save Landing Page"}</button>
    </>
  );
}
