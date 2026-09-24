// Deterministic color per unique topic string, so the same topic always
// gets the same background wherever it appears in the 32-row grid. 12
// hues spread evenly around the color wheel (30° apart) at real
// saturation — the previous palette was all ~90%+ lightness at near-zero
// saturation, so all 12 "colors" read as nearly the same off-white and
// defeated the entire point of coloring by topic. Kept light enough
// (L=78%) that dark text stays readable on top.
const PALETTE = [
  "#E2ACAC", "#E2C7AC", "#E2E2AC", "#C7E2AC", "#ACE2AC", "#ACE2C7",
  "#ACE2E2", "#ACC7E2", "#ACACE2", "#C7ACE2", "#E2ACE2", "#E2ACC7",
];

export function colorForTopic(topic: string): string {
  if (!topic || !topic.trim()) return "transparent";
  let hash = 0;
  for (let i = 0; i < topic.length; i++) hash = (hash * 31 + topic.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
