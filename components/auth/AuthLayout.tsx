import AuthIllustration from "./AuthIllustration";

/** Split sign-in layout: brand story on the left, the form card on the right.
 * The left panel collapses away on tablets/phones (see .auth in globals.css). */
export default function AuthLayout({
  heroTitle,
  heroText,
  children,
}: {
  heroTitle: React.ReactNode;
  heroText: string;
  children: React.ReactNode;
}) {
  return (
    <div className="auth">
      <section className="auth-visual" aria-hidden="true">
        <div className="auth-visual-brand">
          <img src="/brand/obehub-mark.webp" alt="" width={46} height={44} />
          OBEHUB
        </div>
        <div>
          <div className="auth-hero">
            <h2>{heroTitle}</h2>
            <p>{heroText}</p>
          </div>
          <AuthIllustration />
        </div>
        <div className="auth-pills">
          <span className="auth-pill">Outcome</span>
          <span className="auth-pill">Learn</span>
          <span className="auth-pill">Assess</span>
          <span className="auth-pill">Excel</span>
        </div>
      </section>
      <section className="auth-panel">{children}</section>
    </div>
  );
}
