// Demo names (item 13): the title matches the first name — "Ms." for a woman's name, "Mr." for a man's, "Dr." for some.
export const FEMALE = new Set(["Sara", "Ayesha", "Zainab", "Hira", "Maryam", "Iqra", "Noor", "Amna", "Fatima", "Laiba", "Sana", "Rabia", "Hina", "Nida", "Mahnoor", "Areeba", "Kinza", "Saba", "Rubina", "Ayesha", "Sadia", "Mehwish", "Uzma", "Anam", "Javeria", "Bushra", "Rimsha", "Alina", "Eman", "Hafsa"]);
export const titleFor = (first: string, i: number) => (i % 3 === 2 ? "Dr." : FEMALE.has(first) ? "Ms." : "Mr.");
/** "Ms. Fahad Qureshi" → "Mr. Fahad Qureshi"; names without a title, or with the right one, unchanged. */
export function fixTitle(name: string) {
  const m = /^(Mr\.|Ms\.|Mrs\.)\s+(\S+)(.*)$/.exec(name);
  if (!m) return name;
  const want = FEMALE.has(m[2]) ? "Ms." : "Mr.";
  return m[1] === want || (m[1] === "Mrs." && want === "Ms.") ? name : `${want} ${m[2]}${m[3]}`;
}
