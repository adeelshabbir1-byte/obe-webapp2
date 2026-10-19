/** A round photo, or initials when there is none. */
export default function PersonAvatar({ name, photo, size = 30 }: { name: string; photo?: string | null; size?: number }) {
  const ini = name.replace(/^(Dr|Mr|Ms|Mrs|Prof)\.?\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, verticalAlign: "middle", marginRight: 6, fontSize: size * 0.38, fontWeight: 700, color: "#fff", background: photo ? `center / cover no-repeat url(${photo})` : "#7A2E3B" }}>{photo ? "" : ini}</span>
  );
}
