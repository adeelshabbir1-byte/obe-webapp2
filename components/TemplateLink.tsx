/** "Download format" link shown next to every spreadsheet upload. */
export default function TemplateLink({ name, href, label = "Download format" }: { name?: string; href?: string; label?: string }) {
  return <a href={href || `/api/templates/${name}`} className="btn btn-secondary btn-sm" style={{ textDecoration: "none", fontSize: 12 }}>⬇ {label}</a>;
}
