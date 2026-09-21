"use client";

import { useState, useEffect } from "react";

type Config = {
  provider: string; model: string; enabled: boolean;
  apiKeyMasked: string | null; hasKey: boolean;
  lastTestedAt: string | null; lastTestOk: boolean | null; lastTestNote: string | null;
};

export default function AiConfigForm() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [provider, setProvider] = useState("anthropic");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [enabled, setEnabled] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/chairman/ai-config")
      .then((r) => r.json())
      .then((data) => {
        if (data.config) {
          setConfig(data.config);
          setProvider(data.config.provider);
          setModel(data.config.model);
          setEnabled(data.config.enabled);
        }
        setLoaded(true);
      });
  }, []);

  async function save() {
    setLoading(true); setError(""); setSaved(false);
    try {
      const body: any = { provider, model, enabled };
      if (newKey.trim()) body.apiKey = newKey.trim();
      const res = await fetch("/api/chairman/ai-config", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setNewKey("");
      setConfig((prev) => prev ? { ...prev, provider, model, enabled, apiKeyMasked: data.apiKeyMasked, hasKey: !!data.apiKeyMasked } : { provider, model, enabled, apiKeyMasked: data.apiKeyMasked, hasKey: !!data.apiKeyMasked, lastTestedAt: null, lastTestOk: null, lastTestNote: null });
      setLoading(false); setSaved(true);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function testConnection() {
    setTesting(true); setError("");
    try {
      const res = await fetch("/api/chairman/ai-config/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setTesting(false); return; }
      setConfig((prev) => prev ? { ...prev, lastTestedAt: new Date().toISOString(), lastTestOk: data.ok, lastTestNote: data.note } : prev);
      setTesting(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setTesting(false); }
  }

  if (!loaded) return <p style={{ fontSize: 13, color: "var(--slate)" }}>Loading…</p>;

  return (
    <div className="card" style={{ maxWidth: 520 }}>
      {error && <div className="err" style={{ marginBottom: 12 }}>{error}</div>}
      {saved && <div style={{ color: "var(--sage)", fontSize: 12.5, marginBottom: 12 }}>Saved.</div>}

      <div className="field" style={{ marginBottom: 12 }}>
        <label>Provider</label>
        <select value={provider} onChange={(e) => setProvider(e.target.value)}>
          <option value="anthropic">Anthropic</option>
        </select>
        <p style={{ fontSize: 11, color: "var(--slate)", marginTop: 2 }}>Only Anthropic is wired up currently.</p>
      </div>

      <div className="field" style={{ marginBottom: 12 }}>
        <label>Model</label>
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="claude-sonnet-4-6" />
      </div>

      <div className="field" style={{ marginBottom: 12 }}>
        <label>API Key</label>
        {config?.apiKeyMasked && (
          <p style={{ fontSize: 12, marginBottom: 4 }}>Currently saved: <code>{config.apiKeyMasked}</code></p>
        )}
        <input value={newKey} onChange={(e) => setNewKey(e.target.value)} type="password" placeholder={config?.hasKey ? "Enter a new key to replace it" : "Enter your API key"} />
      </div>

      <div className="field" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
        <input type="checkbox" id="ai-enabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <label htmlFor="ai-enabled" style={{ marginBottom: 0 }}>Enabled — use this key instead of the platform default</label>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={save} disabled={loading} className="btn btn-brass">{loading ? "Saving…" : "Save"}</button>
        <button onClick={testConnection} disabled={testing || !config?.hasKey} className="btn" style={{ background: "transparent", border: "1px solid var(--line)" }}>
          {testing ? "Testing…" : "Test Connection"}
        </button>
      </div>

      {config?.lastTestedAt && (
        <div style={{ marginTop: 12, fontSize: 12, color: config.lastTestOk ? "var(--sage)" : "var(--rust)" }}>
          Last tested {new Date(config.lastTestedAt).toLocaleString()}: {config.lastTestOk ? "✓ " : "✗ "}{config.lastTestNote}
        </div>
      )}
    </div>
  );
}
