/** Parses a fetch response as JSON, but with a genuinely helpful message
 * when the body isn't valid JSON at all (an empty or HTML error page from
 * a server crash/timeout) — the raw browser exception in that case is
 * "Unexpected end of JSON input", which tells the person nothing useful. */
export async function safeFetchJson(res: Response): Promise<{ ok: boolean; data: any }> {
  const text = await res.text();
  if (!text) {
    return { ok: false, data: { error: "The server didn't return a response — this usually means a database migration hasn't been run yet, or the request timed out. Try again, and check with support if it keeps happening." } };
  }
  try {
    return { ok: res.ok, data: JSON.parse(text) };
  } catch {
    return { ok: false, data: { error: "The server returned an unexpected response — this usually means a database migration hasn't been run yet, or something crashed server-side. Try again, and check with support if it keeps happening." } };
  }
}
