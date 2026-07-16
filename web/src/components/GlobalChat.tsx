import React, { useEffect, useRef, useState } from "react";
import { MessageSquare, Send, X, Loader2, RotateCcw, ChevronDown } from "lucide-react";
import { api } from "../lib/api";

type Role = "system" | "user" | "assistant";
interface Msg { role: Role; content: string; }

const MODELS = [
  { id: "openai/gpt-4o-mini",                  label: "GPT-4o mini" },
  { id: "openai/gpt-4o",                       label: "GPT-4o" },
  { id: "openai/gpt-5",                        label: "GPT-5" },
  { id: "google-ai-studio/gemini-2.5-flash",   label: "Gemini 2.5 Flash" },
  { id: "anthropic/claude-sonnet-4-5",         label: "Claude Sonnet 4.5" },
];

// Global floating Chat — accessible from any tab. Receives the active tab as
// context so the model can answer "what tab am I on?" coherently.
export default function GlobalChat({ activeTab }: { activeTab: string }) {
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState(MODELS[0].id);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Persist convo between tab switches (memory only — lost on reload).
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy]);

  // Close on Escape
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && open) setOpen(false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    const userMsg: Msg = { role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages(next); setInput(""); setBusy(true); setErr(null);

    const sys: Msg = {
      role: "system",
      content:
        `You are an assistant inside the Acme ContentForge studio. ` +
        `The user is currently on the "${activeTab}" tab. ` +
        `Keep answers tight and actionable. When relevant, suggest which tab to use for what they're asking.`,
    };

    try {
      const r = await api.chat({ messages: [sys, ...next], model, max_tokens: 1024 });
      setMessages([...next, { role: "assistant", content: r.content || "(empty)" }]);
    } catch (e: any) {
      setErr(e?.body?.message ?? e?.body?.error ?? "chat failed");
      setMessages(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Floating action button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`fixed bottom-5 right-5 z-40 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all ${
          open
            ? "bg-studio-coffee border border-studio-bronze/40 text-studio-soft-white"
            : "bg-studio-bronze text-studio-warm-black hover:scale-105"
        }`}
        title="Open chat (anywhere in the app)"
      >
        {open ? <ChevronDown className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
      </button>

      {/* Slide-over panel */}
      <div
        className={`fixed top-0 right-0 bottom-0 z-30 w-full sm:w-[420px] bg-studio-coffee border-l border-studio-bronze/20 shadow-2xl transition-transform duration-200 flex flex-col ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between p-3 border-b border-studio-bronze/15">
          <div>
            <div className="font-display font-bold text-sm flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> Chat
            </div>
            <div className="text-[10px] font-mono text-studio-soft-white/40">
              context: {activeTab.replace(/_/g, " ")}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={model} onChange={(e) => setModel(e.target.value)}
              className="bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1 text-[10px]"
            >
              {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            {messages.length > 0 && (
              <button onClick={() => { setMessages([]); setErr(null); }} className="text-studio-soft-white/40 hover:text-studio-soft-white" title="reset">
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={() => setOpen(false)} className="text-studio-soft-white/40 hover:text-studio-soft-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
          {messages.length === 0 && (
            <div className="text-center text-studio-soft-white/40 text-xs pt-8 space-y-2">
              <div className="text-studio-bronze font-mono">Try:</div>
              <div>"Give me a funny joke"</div>
              <div>"Draft a LinkedIn hook for my current article"</div>
              <div>"What tab should I use to schedule a post?"</div>
              <div>"Summarize the workflow spec in 3 lines"</div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[88%] rounded-lg px-3 py-2 whitespace-pre-wrap text-[13px] ${
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
            <div className="bg-red-900/20 border border-red-700/40 rounded p-2 text-xs text-red-300">{err}</div>
          )}
        </div>

        <form onSubmit={send} className="flex gap-2 p-3 border-t border-studio-bronze/15">
          <input
            value={input} onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything…"
            disabled={busy}
            className="flex-1 bg-studio-brown/40 border border-studio-bronze/20 rounded px-3 py-2 text-sm"
          />
          <button
            type="submit" disabled={!input.trim() || busy}
            className="bg-studio-bronze text-studio-warm-black font-semibold text-xs px-3 rounded disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </>
  );
}
