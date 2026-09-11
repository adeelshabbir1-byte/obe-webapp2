import { prisma } from "../lib/db";
import { getAuthenticatedUser } from "../lib/session";

export default async function Home() {
  const user = await getAuthenticatedUser();
  const ctaHref = user ? "/dashboard" : "/login";
  const ctaLabel = user ? "Go to Dashboard" : "Login";

  const content = await prisma.landingPageContent.findFirst();
  const features: { title: string; description: string }[] = content?.featuresJson ? JSON.parse(content.featuresJson) : DEFAULT_FEATURES;
  const testimonials: { quote: string; author: string }[] = content?.testimonialsJson ? JSON.parse(content.testimonialsJson) : [];

  const headline = content?.headline || "Outcome-Based Education Governance, Built for Accreditation";
  const subheadline = content?.subheadline || "Design, deliver, and prove learning outcomes across your entire institution — from curriculum to classroom to accreditation report.";

  return (
    <div style={{ background: "var(--paper)", color: "var(--ink)" }}>
      {/* Nav */}
      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 48px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 20 }}>OBE Platform</div>
        <a href={ctaHref} className="btn btn-brass" style={{ textDecoration: "none" }}>{ctaLabel}</a>
      </nav>

      {/* Hero */}
      <section style={{ padding: "90px 48px 70px", textAlign: "center", maxWidth: 780, margin: "0 auto" }}>
        <h1 style={{ fontSize: 42, lineHeight: 1.15, marginBottom: 20, animation: "fadeInUp .6s cubic-bezier(.4,0,.2,1)" }}>{headline}</h1>
        <p style={{ fontSize: 17, color: "var(--slate)", lineHeight: 1.6, marginBottom: 32, animation: "fadeInUp .7s cubic-bezier(.4,0,.2,1)" }}>{subheadline}</p>
        <a href={ctaHref} className="btn btn-brass" style={{ textDecoration: "none", padding: "13px 32px", fontSize: 15 }}>{user ? "Go to Dashboard" : "Sign In to Your Institution"}</a>
      </section>

      {/* Features */}
      <section style={{ padding: "50px 48px 70px", maxWidth: 1080, margin: "0 auto" }}>
        <h2 style={{ fontSize: 26, textAlign: "center", marginBottom: 40 }}>Everything Your Program Needs</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
          {features.map((f, i) => (
            <div key={i} className="card clickable" style={{ padding: 24 }}>
              <h3 style={{ fontSize: 16, marginBottom: 8, color: "var(--brass-dark)" }}>{f.title}</h3>
              <p style={{ fontSize: 13.5, color: "var(--slate)", lineHeight: 1.55 }}>{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* About & Mission */}
      {(content?.aboutText || content?.missionText) && (
        <section style={{ padding: "50px 48px", background: "var(--card)", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
          <div style={{ maxWidth: 820, margin: "0 auto", display: "grid", gridTemplateColumns: content.aboutText && content.missionText ? "1fr 1fr" : "1fr", gap: 40 }}>
            {content.aboutText && (
              <div>
                <h3 style={{ fontSize: 18, marginBottom: 10 }}>About</h3>
                <p style={{ fontSize: 13.5, color: "var(--slate)", lineHeight: 1.6, whiteSpace: "pre-line" }}>{content.aboutText}</p>
              </div>
            )}
            {content.missionText && (
              <div>
                <h3 style={{ fontSize: 18, marginBottom: 10 }}>Our Mission</h3>
                <p style={{ fontSize: 13.5, color: "var(--slate)", lineHeight: 1.6, whiteSpace: "pre-line" }}>{content.missionText}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Testimonials */}
      {testimonials.length > 0 && (
        <section style={{ padding: "60px 48px", maxWidth: 900, margin: "0 auto" }}>
          <h2 style={{ fontSize: 24, textAlign: "center", marginBottom: 32 }}>What Institutions Say</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
            {testimonials.map((t, i) => (
              <div key={i} className="card" style={{ padding: 22 }}>
                <p style={{ fontSize: 13.5, fontStyle: "italic", color: "var(--ink)", marginBottom: 10, lineHeight: 1.55 }}>"{t.quote}"</p>
                <p style={{ fontSize: 12, color: "var(--slate)", fontWeight: 600 }}>— {t.author}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Pricing note */}
      {content?.pricingNote && (
        <section style={{ padding: "40px 48px", textAlign: "center", maxWidth: 700, margin: "0 auto" }}>
          <p style={{ fontSize: 13.5, color: "var(--slate)", lineHeight: 1.6, whiteSpace: "pre-line" }}>{content.pricingNote}</p>
        </section>
      )}

      {/* Footer / contact */}
      <footer style={{ padding: "36px 48px", borderTop: "1px solid var(--line)", textAlign: "center" }}>
        {(content?.contactEmail || content?.contactPhone) && (
          <p style={{ fontSize: 13, color: "var(--slate)", marginBottom: 8 }}>
            {content?.contactEmail && <>Email: {content.contactEmail}</>}
            {content?.contactEmail && content?.contactPhone && "  ·  "}
            {content?.contactPhone && <>Phone: {content.contactPhone}</>}
          </p>
        )}
        <p style={{ fontSize: 11.5, color: "var(--slate)" }}>© {new Date().getFullYear()} — All rights reserved.</p>
      </footer>
    </div>
  );
}

const DEFAULT_FEATURES = [
  { title: "Curriculum Design", description: "Build CLOs mapped to Bloom's Taxonomy, link them to PLOs with weighted contributions, and plan every lecture." },
  { title: "Quality Governance", description: "OMC oversight of weight policy, course design review, and full accreditation-ready audit trails." },
  { title: "Real Attainment Data", description: "Direct attainment from actual marks, plus indirect attainment from stakeholder surveys — genuine evidence, not spreadsheets." },
  { title: "Full Student Transcripts", description: "GPA, CLO, and PLO attainment tracked per student across their entire academic history." },
  { title: "Multi-Tenant, Multi-Program", description: "One platform, many institutions — each with its own branding, licensing, and governance." },
  { title: "Built for Accreditation", description: "Every report, form, and document is designed to be audit-ready for NCEAC and similar bodies." },
];
