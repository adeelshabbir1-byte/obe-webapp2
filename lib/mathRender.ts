// Equations stored as LaTeX ($…$ inline, $$…$$ display), drawn the same way everywhere: KaTeX on screen and in quizzes
// (components/MathText.tsx); in PDF papers as sharp images (MathJax → SVG → PNG at 4×); in Word as native equations
// where the LaTeX is simple enough (fractions, roots, powers, sub-scripts, sums, integrals, Greek), else the same image.

type Img = { png: Uint8Array; width: number; height: number; depth: number };
let doc: { convert: (tex: string, o: { display: boolean }) => unknown } | null = null;
let adaptor: { innerHTML: (n: unknown) => string; outerHTML: (n: unknown) => string } | null = null;

async function mj() {
  if (doc) return { doc, adaptor: adaptor! };
  const { mathjax } = await import("mathjax-full/js/mathjax.js");
  const { TeX } = await import("mathjax-full/js/input/tex.js");
  const { SVG } = await import("mathjax-full/js/output/svg.js");
  const { liteAdaptor } = await import("mathjax-full/js/adaptors/liteAdaptor.js");
  const { RegisterHTMLHandler } = await import("mathjax-full/js/handlers/html.js");
  const { AllPackages } = await import("mathjax-full/js/input/tex/AllPackages.js");
  adaptor = liteAdaptor() as never;
  RegisterHTMLHandler(adaptor as never);
  doc = mathjax.document("", { InputJax: new TeX({ packages: AllPackages }), OutputJax: new SVG({ fontCache: "none" }) }) as never;
  return { doc: doc!, adaptor: adaptor! };
}

const cache = new Map<string, Img>();
/** LaTeX → PNG (4× for print) with its size in points at 11 pt text; mhchem (\ce{…}) works too. */
export async function latexPng(tex: string, display = false, fontPt = 11): Promise<Img | null> {
  const key = `${display ? "D" : "I"}|${fontPt}|${tex}`;
  if (cache.has(key)) return cache.get(key)!;
  try {
    const { doc, adaptor } = await mj();
    let svg = adaptor.innerHTML(doc.convert(tex, { display }));
    const exPt = fontPt * 0.44;
    const num = (re: RegExp) => Number((svg.match(re) || [])[1] || 0);
    const wEx = num(/width="([\d.]+)ex"/), hEx = num(/height="([\d.]+)ex"/), va = num(/vertical-align:\s*(-?[\d.]+)ex/);
    if (!wEx || !hEx) return null;
    const width = wEx * exPt, height = hEx * exPt;
    svg = svg.replace(/currentColor/g, "#231a1c").replace(/width="[\d.]+ex"/, `width="${width * 4}"`).replace(/height="[\d.]+ex"/, `height="${height * 4}"`);
    const { Resvg } = await import("@resvg/resvg-js");
    const png = new Resvg(svg, { background: "rgba(255,255,255,0)" }).render().asPng();
    const img = { png: new Uint8Array(png), width, height, depth: -va * exPt };
    if (cache.size > 500) cache.clear();
    cache.set(key, img);
    return img;
  } catch { return null; }
}

// ---- Word: native equations for simple LaTeX
const GREEK: Record<string, string> = { alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ", phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω", Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω" };
const SYMBOL: Record<string, string> = { times: "×", cdot: "·", div: "÷", pm: "±", mp: "∓", leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠", approx: "≈", equiv: "≡", infty: "∞", to: "→", rightarrow: "→", leftarrow: "←", Rightarrow: "⇒", in: "∈", notin: "∉", subset: "⊂", subseteq: "⊆", cup: "∪", cap: "∩", forall: "∀", exists: "∃", neg: "¬", land: "∧", lor: "∨", partial: "∂", nabla: "∇", ldots: "…", cdots: "⋯", circ: "∘", emptyset: "∅", sim: "∼", prime: "′" };

/** Builds docx Math children from LaTeX, or null when the LaTeX uses something this small converter does not know. */
export async function latexDocx(tex: string): Promise<unknown[] | null> {
  const d = await import("docx");
  let i = 0; const s = tex.trim();
  const fail = () => { throw new Error("unsupported"); };
  const group = (): unknown[] => {
    skip();
    if (s[i] === "{") { i++; const out = seq("}"); if (s[i] !== "}") fail(); i++; return out; }
    return atom();
  };
  const skip = () => { while (s[i] === " ") i++; };
  const atom = (): unknown[] => {
    skip();
    const ch = s[i];
    if (ch === undefined) fail();
    if (ch === "\\") {
      const m = s.slice(i + 1).match(/^[a-zA-Z]+|^./)!; const name = m[0]; i += 1 + name.length;
      if (name === "frac") { const n = group(), dd = group(); return [new d.MathFraction({ numerator: n as never, denominator: dd as never })]; }
      if (name === "sqrt") { skip(); let deg: unknown[] | undefined; if (s[i] === "[") { i++; deg = seq("]"); i++; } const b = group(); return [new d.MathRadical({ children: b as never, degree: deg as never })]; }
      if (name === "sum" || name === "int" || name === "prod") {
        let sub: unknown[] | undefined, sup: unknown[] | undefined; skip();
        for (let k = 0; k < 2; k++) { if (s[i] === "_") { i++; sub = group(); } else if (s[i] === "^") { i++; sup = group(); } skip(); }
        const body = rest();
        const Cls = name === "sum" ? d.MathSum : name === "int" ? d.MathIntegral : d.MathSum;
        return [new Cls({ children: body as never, subScript: sub as never, superScript: sup as never })];
      }
      if (GREEK[name]) return [new d.MathRun(GREEK[name])];
      if (SYMBOL[name]) return [new d.MathRun(SYMBOL[name])];
      if (["sin", "cos", "tan", "log", "ln", "exp", "lim", "max", "min"].includes(name)) return [new d.MathRun(name)];
      if (name === "left" || name === "right") { const del = s[i] === "\\" ? s.slice(i + 1).match(/^[a-zA-Z]+|^./)![0] : s[i]; i += s[i] === "\\" ? 1 + del.length : 1; return del === "." ? [] : [new d.MathRun(del === "{" || del === "}" ? del : del)]; }
      if (name === "," || name === ";" || name === " " || name === "quad") return [new d.MathRun(" ")];
      if (name === "{" || name === "}") return [new d.MathRun(name)];
      return fail();
    }
    if (ch === "{") return group();
    i++;
    return [new d.MathRun(ch)];
  };
  // A base followed by ^ / _.
  const term = (): unknown[] => {
    const base = atom(); skip();
    let sup: unknown[] | null = null, sub: unknown[] | null = null;
    for (let k = 0; k < 2; k++) { if (s[i] === "^") { i++; sup = group(); } else if (s[i] === "_") { i++; sub = group(); } skip(); }
    if (sup && sub) return [new d.MathSubSuperScript({ children: base as never, subScript: sub as never, superScript: sup as never })];
    if (sup) return [new d.MathSuperScript({ children: base as never, superScript: sup as never })];
    if (sub) return [new d.MathSubScript({ children: base as never, subScript: sub as never })];
    return base;
  };
  const seq = (end: string): unknown[] => { const out: unknown[] = []; skip(); while (i < s.length && s[i] !== end) { out.push(...term()); skip(); } return out; };
  const rest = (): unknown[] => { const out: unknown[] = []; skip(); while (i < s.length && s[i] !== "}" && !/^\s*[=+<>-]/.test(s.slice(i, i + 1))) { out.push(...term()); skip(); } return out; };
  try { const out = seq("\u0000"); return i >= s.length ? out : null; } catch { return null; }
}
