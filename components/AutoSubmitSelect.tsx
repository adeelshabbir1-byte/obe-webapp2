"use client";

export default function AutoSubmitSelect({ name, defaultValue, options }: {
  name: string; defaultValue: string; options: { value: string; label: string }[];
}) {
  return (
    <form method="GET" style={{ display: "inline" }}>
      <select
        name={name}
        defaultValue={defaultValue}
        onChange={(e) => e.currentTarget.form?.submit()}
        style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </form>
  );
}
