// Display helpers for people's names. Academic names often start with a
// title ("Dr. Ayesha Rahman", "Prof. …", "Engr. …"), which must not be
// mistaken for the first name ("Hello, Dr.") or used for initials ("DR").

const HONORIFICS = new Set([
  "dr", "prof", "professor", "mr", "mrs", "ms", "miss", "engr", "eng", "sir", "madam",
]);
// Of the above, only these are titles people are greeted with.
const GREETING_TITLES = new Set(["dr", "prof", "professor", "engr"]);

function parts(name: string) {
  return name.trim().split(/\s+/).filter(Boolean);
}

function isHonorific(word: string) {
  return HONORIFICS.has(word.toLowerCase().replace(/\.$/, ""));
}

/** "Dr. Ayesha Rahman" → "Dr. Ayesha"; "Imran Qureshi" → "Imran". */
export function greetingName(name: string) {
  const p = parts(name);
  if (p.length === 0) return name;
  let i = 0;
  while (i < p.length - 1 && isHonorific(p[i])) i++;
  const title = i > 0 && GREETING_TITLES.has(p[0].toLowerCase().replace(/\.$/, "")) ? `${p[0]} ` : "";
  return `${title}${p[i]}`;
}

/** "Dr. Ayesha Rahman" → "AR"; "Imran" → "I". */
export function initials(name: string) {
  const p = parts(name);
  let i = 0;
  while (i < p.length - 1 && isHonorific(p[i])) i++;
  const rest = p.slice(i);
  if (rest.length === 0) return "?";
  return ((rest[0][0] || "") + (rest.length > 1 ? rest[rest.length - 1][0] : "")).toUpperCase();
}
