/** Pulls the text out of a PDF buffer. Uses pdf-parse first (fast), and falls
 * back to Mozilla's pdf.js if that fails or finds no text — pdf-parse bundles
 * an old pdf.js that rejects many newer PDFs ("bad XRef entry", etc.).
 * Returns the reason on failure so the caller can tell the user what is
 * actually wrong rather than a generic message. */
export type PdfTextResult = { ok: true; text: string } | { ok: false; reason: "unreadable" | "no-text"; detail: string };

async function viaPdfParse(buffer: Buffer): Promise<string> {
  // Import the library file directly: the package's index.js runs a
  // self-test that reads a file from disk when bundled, which crashes on
  // Vercel and made EVERY upload report "couldn't read that PDF".
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
  const parsed = await pdfParse(buffer);
  return parsed.text || "";
}

async function viaPdfJs(buffer: Buffer): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer), useSystemFonts: true, disableFontFace: true, isEvalSupported: false,
  }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // Keep line structure: start a new line whenever an item ends its line.
    for (const item of content.items as any[]) text += item.str + (item.hasEOL ? "\n" : " ");
    text += "\n";
  }
  return text;
}

export async function extractPdfText(buffer: Buffer): Promise<PdfTextResult> {
  const errors: string[] = [];
  for (const [name, fn] of [["pdf-parse", viaPdfParse], ["pdf.js", viaPdfJs]] as const) {
    try {
      const text = await fn(buffer);
      if (text.trim().length > 20) return { ok: true, text };
      errors.push(`${name}: no text found`);
    } catch (err: any) {
      errors.push(`${name}: ${err?.message || err}`);
    }
  }
  const allEmpty = errors.every((e) => e.endsWith("no text found"));
  return { ok: false, reason: allEmpty ? "no-text" : "unreadable", detail: errors.join(" | ") };
}
