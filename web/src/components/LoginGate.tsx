import React, { useState } from "react";
import { useAuth } from "../lib/auth-context";

export default function LoginGate() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await login(email, password); }
    catch (e: any) { setErr(e?.body?.error ?? "login failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-studio-warm-black text-studio-soft-white flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="studio-glass-glow rounded-lg p-8 w-full max-w-sm space-y-4">
        <div className="text-center mb-4">
          <div className="text-lg font-display font-black tracking-tighter italic uppercase">
            ACME<span className="text-studio-bronze">.</span>
          </div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-studio-bronze mt-1">
            Intelligence Studio
          </div>
        </div>
        <input
          type="email" autoFocus required placeholder="email"
          value={email} onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-3 py-2 text-sm focus:outline-none focus:border-studio-bronze"
        />
        <input
          type="password" required placeholder="password"
          value={password} onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-3 py-2 text-sm focus:outline-none focus:border-studio-bronze"
        />
        {err && <div className="text-red-400 text-xs">{err}</div>}
        <button
          type="submit" disabled={busy}
          className="w-full bg-studio-bronze text-studio-warm-black font-semibold py-2 rounded text-sm disabled:opacity-50"
        >
          {busy ? "..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
