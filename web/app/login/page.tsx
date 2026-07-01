"use client";
import { useState } from "react";
import { SITE } from "@/lib/site.config";

export const dynamic = "force-dynamic";

export default function Login() {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: pw }),
    })
      .then((r) => r.json())
      .catch(() => ({ ok: false, reason: "Network error." }));
    if (!r.ok) {
      setBusy(false);
      setErr(r.reason || "Incorrect password.");
      return;
    }
    // full navigation so the freshly-set cookie rides along
    const next = new URLSearchParams(window.location.search).get("next") || "/";
    window.location.replace(next.startsWith("/") ? next : "/");
  };

  return (
    <div className="loginwrap">
      <form className="card logincard" onSubmit={submit}>
        <div className="brand">
          {SITE.brand}
        </div>
        <p className="muted" style={{ margin: "4px 0 14px" }}>Enter the password to continue.</p>
        <input
          type="password"
          autoFocus
          placeholder="Password"
          aria-label="Password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
        <button className="btn" type="submit" disabled={busy} style={{ marginTop: 12, width: "100%" }}>
          {busy ? (
            <>
              <span className="spin" /> Checking…
            </>
          ) : (
            "Enter"
          )}
        </button>
        {err && <p style={{ color: "var(--danger)", marginTop: 10, fontSize: 14 }}>{err}</p>}
      </form>
    </div>
  );
}
