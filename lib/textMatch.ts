// Topic wording helpers shared by the server and the browser (no database imports here).
export const norm = (t: string) => (t || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9+#]+/g, " ").trim();
const STOP = new Set("a an the and or of to in on for with by from as at into is are introduction intro overview basics basic part i ii iii iv".split(" "));
const words = (t: string) => new Set(norm(t).split(" ").filter((w) => w.length > 1 && !STOP.has(w)));
export function similarity(a: string, b: string) {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let n = 0; A.forEach((w) => { if (B.has(w)) n++; });
  return n / (A.size + B.size - n);
}
