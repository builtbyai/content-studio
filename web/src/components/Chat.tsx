import React, { useState } from "react";
import { MessageSquare, Send, Loader2, RotateCcw } from "lucide-react";
import { api } from "../lib/api";

type Role = "system" | "user" | "assistant";
interface Msg { role: Role; content: string; }

const MODELS = [
  { id: "openai/gpt-4o-mini",                  label: "GPT-4o mini (cheap, fast)" },
  { id: "openai/gpt-4o",                       label: "GPT-4o" },
  { id: "openai/gpt-5",                        label: "GPT-5" },
  { id: "openai/gpt-5-mini",                   label: "GPT-5 mini" },
  { id: "google-ai-studio/gemini-2.5-flash",   label: "Gemini 2.5 Flash" },
  { id: "google-ai-studio/gemini-2.5-pro",     label: "Gemini 2.5 Pro" },
  { id: "anthropic/claude-sonnet-4-5",         label: "Claude Sonnet 4.5" },
];

const SYSTEM = "You are a helpful, concise assistant inside the Acme Intelligence Studio.";

export default function Chat() {
  const [model, setModel] = useState(MODELS[0].id);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    const next: Msg[] = [...messages, { role: "user" as const, content: text }];
    setMessages(next); setInput(""); setBusy(true); setErr(null);

    try {
      const payload: Msg[] = [{ role: "system" as const, content: SYSTEM }, ...next];
      const res = await api.chat({ messages: payload, model, max_tokens: 1024 });
      setMessages([...next, { role: "assistant" as const, content: res.content || "(empty response)" }]);
    } catch (e: any) {
      setErr(e?.body?.message ?? e?.body?.error ?? "chat failed");
      setMessages(next);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => { setMessages([]); setErr(null); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-display font-bold flex items-center gap-2">
            <MessageSquare className="w-5 h-5" /> Chat
          </h2>
          <p className="text-xs text-studio-soft-white/60 mt-1">
            Multi-provider chat via Cloudflare AI Gateway. Logs + cost in
            dashboard → AI Gateway → contentforge-ai.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={model} onChange={(e) => setModel(e.target.value)}
            className="bg-studio-brown/40 border border-studio-bronze/20 rounded px-3 py-1.5 text-xs"
          >
            {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          {messages.length > 0 && (
            <button onClick={reset} className="text-xs text-studio-soft-white/50 hover:text-studio-soft-white flex items-center gap-1">
              <RotateCcw className="w-3 h-3" /> reset
            </button>
          )}
        </div>
      </div>

      <div className="studio-glass rounded-lg p-4 min-h-[320px] max-h-[60vh] overflow-y-auto space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-sm text-studio-soft-white/40 pt-12">
            <div className="text-studio-bronze mb-2">Try:</div>
            <div className="space-y-1">
              <div>"Give me a funny joke"</div>
              <div>"Draft a LinkedIn hook for an article about objection-crushing in roofing sales"</div>
              <div>"Summarize the multi-model workflow spec in 3 bullets"</div>
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-studio-bronze text-studio-warm-black font-medium"
                  : "bg-studio-brown/60 border border-studio-bronze/15"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-studio-soft-white/50">
            <Loader2 className="w-3 h-3 animate-spin" /> thinking…
          </div>
        )}
        {err && (
          <div className="bg-red-900/20 border border-red-700/40 rounded p-2 text-xs text-red-300">
            {err}
          </div>
        )}
      </div>

      <form onSubmit={send} className="flex gap-2">
        <input
          value={input} onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything…"
          disabled={busy}
          className="flex-1 bg-studio-brown/40 border border-studio-bronze/20 rounded px-3 py-2 text-sm"
        />
        <button
          type="submit" disabled={!input.trim() || busy}
          className="bg-studio-bronze text-studio-warm-black font-semibold text-xs px-4 rounded disabled:opacity-50 flex items-center gap-1.5"
        >
          <Send className="w-3.5 h-3.5" /> Send
        </button>
      </form>
    </div>
  );
}
