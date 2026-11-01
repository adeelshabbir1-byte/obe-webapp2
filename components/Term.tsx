import { GLOSSARY } from "../lib/glossary";

// Plain words with the official term (Adeel prompt §19.3): <Term k="clo">CLO</Term> shows a small ⓘ that explains the
// term in one line (hover) and links to the glossary. One shared glossary: lib/glossary.ts.
export default function Term({ k, children }: { k: string; children?: React.ReactNode }) {
  const g = GLOSSARY.find((x) => x.key === k);
  if (!g) return <>{children}</>;
  return (
    <span>{children ?? g.term}<a href={`/help/glossary#${g.key}`} title={`${g.term}: ${g.meaning}`} aria-label={`What is ${g.term}?`} style={{ marginLeft: 3, fontSize: "0.8em", textDecoration: "none", color: "var(--slate, #667)" }}>ⓘ</a></span>
  );
}
