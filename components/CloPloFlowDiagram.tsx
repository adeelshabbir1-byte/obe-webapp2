"use client";

type Assessment = { id: string; label: string; type: string; marksPct: number; cloId: string | null };
type Clo = { id: string; code: string; mappedPloId: string | null; contributionPct: number | null };
type Plo = { id: string; number: number; title: string };

const COL_W = 210, BOX_H = 40, V_GAP = 14, TOP = 30;

function colorForWeight(pct: number, max: number) {
  const intensity = Math.min(1, pct / max);
  // Light amber (low weight) -> saturated rust/brass (high weight)
  const r = Math.round(200 - intensity * 20);
  const g = Math.round(180 - intensity * 100);
  const b = Math.round(140 - intensity * 100);
  return `rgb(${Math.max(r, 150)}, ${Math.max(g, 60)}, ${Math.max(b, 40)})`;
}

export default function CloPloFlowDiagram({ assessments, clos, plos }: { assessments: Assessment[]; clos: Clo[]; plos: Plo[] }) {
  const usedClos = clos.filter((c) => assessments.some((a) => a.cloId === c.id) || c.mappedPloId);
  const usedPlos = plos.filter((p) => usedClos.some((c) => c.mappedPloId === p.id));

  const col1X = 20, col2X = 20 + COL_W + 140, col3X = 20 + (COL_W + 140) * 2;
  const height = Math.max(assessments.length, usedClos.length, usedPlos.length) * (BOX_H + V_GAP) + TOP + 20;
  const width = col3X + COL_W + 20;

  const posFor = (index: number, total: number, colHeight: number) => {
    const usable = colHeight - TOP - 20;
    const spacing = total > 0 ? usable / total : 0;
    return TOP + index * spacing + (spacing - BOX_H) / 2;
  };

  const aPos = new Map(assessments.map((a, i) => [a.id, posFor(i, assessments.length, height)]));
  const cPos = new Map(usedClos.map((c, i) => [c.id, posFor(i, usedClos.length, height)]));
  const pPos = new Map(usedPlos.map((p, i) => [p.id, posFor(i, usedPlos.length, height)]));

  const maxAssessmentWeight = Math.max(1, ...assessments.map((a) => a.marksPct));
  const maxContribution = Math.max(1, ...usedClos.map((c) => c.contributionPct || 0));

  function path(x1: number, y1: number, x2: number, y2: number) {
    const midX = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ minHeight: 300, fontFamily: "inherit" }}>
      <text x={col1X} y={16} fontSize={11} fontWeight={700} fill="var(--slate)">ASSESSMENTS</text>
      <text x={col2X} y={16} fontSize={11} fontWeight={700} fill="var(--slate)">CLOs</text>
      <text x={col3X} y={16} fontSize={11} fontWeight={700} fill="var(--slate)">PLOs</text>

      {/* Assessment -> CLO arrows */}
      {assessments.map((a) => {
        if (!a.cloId || !cPos.has(a.cloId)) return null;
        const y1 = (aPos.get(a.id) || 0) + BOX_H / 2;
        const y2 = (cPos.get(a.cloId) || 0) + BOX_H / 2;
        const color = colorForWeight(a.marksPct, maxAssessmentWeight);
        const midX = (col1X + COL_W + col2X) / 2;
        return (
          <g key={`ac-${a.id}`}>
            <path d={path(col1X + COL_W, y1, col2X, y2)} stroke={color} strokeWidth={Math.max(1.5, (a.marksPct / maxAssessmentWeight) * 5)} fill="none" opacity={0.8} />
            <rect x={midX - 16} y={(y1 + y2) / 2 - 9} width={32} height={16} fill="#fff" stroke={color} strokeWidth={1} rx={3} />
            <text x={midX} y={(y1 + y2) / 2 + 3} fontSize={9.5} fontWeight={700} fill={color} textAnchor="middle">{a.marksPct}%</text>
          </g>
        );
      })}

      {/* CLO -> PLO arrows */}
      {usedClos.map((c) => {
        if (!c.mappedPloId || !pPos.has(c.mappedPloId) || !c.contributionPct) return null;
        const y1 = (cPos.get(c.id) || 0) + BOX_H / 2;
        const y2 = (pPos.get(c.mappedPloId) || 0) + BOX_H / 2;
        const color = colorForWeight(c.contributionPct, maxContribution);
        const midX = (col2X + COL_W + col3X) / 2;
        return (
          <g key={`cp-${c.id}`}>
            <path d={path(col2X + COL_W, y1, col3X, y2)} stroke={color} strokeWidth={Math.max(1.5, (c.contributionPct / maxContribution) * 5)} fill="none" opacity={0.8} />
            <rect x={midX - 16} y={(y1 + y2) / 2 - 9} width={32} height={16} fill="#fff" stroke={color} strokeWidth={1} rx={3} />
            <text x={midX} y={(y1 + y2) / 2 + 3} fontSize={9.5} fontWeight={700} fill={color} textAnchor="middle">{c.contributionPct}%</text>
          </g>
        );
      })}

      {/* Assessment boxes */}
      {assessments.map((a) => (
        <g key={a.id}>
          <rect x={col1X} y={aPos.get(a.id)} width={COL_W} height={BOX_H} rx={5} fill="#2563EB" />
          <text x={col1X + 10} y={(aPos.get(a.id) || 0) + 17} fontSize={11} fontWeight={600} fill="#fff">{a.type} {a.label}</text>
          <text x={col1X + 10} y={(aPos.get(a.id) || 0) + 31} fontSize={9.5} fill="#DBEAFE">{a.marksPct}% of course grade</text>
        </g>
      ))}

      {/* CLO boxes */}
      {usedClos.map((c) => (
        <g key={c.id}>
          <rect x={col2X} y={cPos.get(c.id)} width={COL_W} height={BOX_H} rx={5} fill="#7C3AED" />
          <text x={col2X + 10} y={(cPos.get(c.id) || 0) + 24} fontSize={12} fontWeight={600} fill="#fff">{c.code}</text>
        </g>
      ))}

      {/* PLO boxes */}
      {usedPlos.map((p) => (
        <g key={p.id}>
          <rect x={col3X} y={pPos.get(p.id)} width={COL_W} height={BOX_H} rx={5} fill="#EA580C" />
          <text x={col3X + 10} y={(pPos.get(p.id) || 0) + 17} fontSize={11} fontWeight={600} fill="#fff">PLO-{p.number}</text>
          <text x={col3X + 10} y={(pPos.get(p.id) || 0) + 31} fontSize={9} fill="#FFE4DC">{p.title.length > 26 ? p.title.slice(0, 24) + "…" : p.title}</text>
        </g>
      ))}
    </svg>
  );
}
