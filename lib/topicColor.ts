// Deterministic pastel color per unique topic string, so the same topic
// always gets the same background wherever it appears in the 32-row grid.
const PALETTE = [
  "#F4EFE1", "#E4EEE8", "#EAE5F0", "#F5EAE5", "#E5EEF5", "#F0EEE0",
  "#EDE5EE", "#E0EDE9", "#F2E9DD", "#E3E9F2", "#EFE0E5", "#E5F0E8",
];

export function colorForTopic(topic: string): string {
  if (!topic || !topic.trim()) return "transparent";
  let hash = 0;
  for (let i = 0; i < topic.length; i++) hash = (hash * 31 + topic.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
