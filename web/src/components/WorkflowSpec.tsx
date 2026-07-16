import React from "react";
import { CheckCircle2, Clock, AlertTriangle } from "lucide-react";

// Maps the 26-node spec to current implementation status. Update as nodes
// transition stub → implemented. Phases match spec §14.

type Status = "implemented" | "stub" | "design-only";

interface NodeRow {
  id: string;
  phase: 1 | 2 | 3 | 4;
  name: string;
  status: Status;
  notes?: string;
}

const NODES: NodeRow[] = [
  { id: "01", phase: 1, name: "Creative Brief Intake",            status: "implemented", notes: "Gemini normaliser + ambiguity flags + readiness score. Called by /api/workflows/:id/execute." },
  { id: "02", phase: 1, name: "Brand Profile Resolver",            status: "implemented", notes: "KV cache + Vectorize nearest-neighbor on brief embedding (bge-base)." },
  { id: "03", phase: 1, name: "Asset Registry + Preservation",     status: "implemented", notes: "Mints preservation tokens for mustPreserve product references." },
  { id: "04", phase: 1, name: "Platform Requirements Mapper",      status: "implemented", notes: "Inline in nodes/creative.ts." },
  { id: "05", phase: 1, name: "Concept Generation",                status: "implemented", notes: "Wraps /api/generate-workflow; called by /api/workflows/:id/execute after Node 01." },
  { id: "06", phase: 2, name: "Film Scene Planner",                status: "implemented", notes: "Multi-scene shot list with subject-continuity tokens. Gemini→OpenAI fallback via llm.ts." },
  { id: "07", phase: 1, name: "Prompt Schema Builder",             status: "implemented", notes: "Emits PromptSpec[] with provider/model ranking + preservation tokens. Contract-aligned to Node 09 shape." },
  { id: "08", phase: 1, name: "Provider Capability Resolver",      status: "implemented", notes: "KV-cached registry (TTL refresh) fallback to hardcoded. Filters by provider+model match." },
  { id: "09", phase: 1, name: "Provider Adapter",                  status: "implemented", notes: "gpt-image-2/1.5 via env.AI binding + Runway REST. Cost captured per call. All through AI Gateway." },
  { id: "10", phase: 1, name: "Cost Governor",                     status: "implemented", notes: "Greedy fit by confidence/cost. /api/workflows/:id/estimate. v2 will pull actuals from AI Gateway." },
  { id: "11", phase: 1, name: "Parallel Provider Dispatcher",      status: "implemented", notes: "Enqueues onto PUBLISH_QUEUE; consumer drives Node 09 → 13. Per-provider concurrency caps applied." },
  { id: "12", phase: 2, name: "Variation Matrix Generator",        status: "implemented", notes: "Cartesian-product variants from axes (capped at 8 per base). Pure code, no LLM." },
  { id: "13", phase: 1, name: "Output Normalizer",                 status: "implemented", notes: "Fetches provider output → R2 → SHA-256 checksum → generated_assets row." },
  { id: "14", phase: 1, name: "Creative Quality Review",           status: "implemented", notes: "LLaVA caption → llamaguard-3-8b safety + palette/product checks. Per-asset score (0-1)." },
  { id: "15", phase: 2, name: "Regeneration + Delta Prompt",       status: "implemented", notes: "LLM emits focused delta for each asset that fails review (<0.72 overall)." },
  { id: "16", phase: 1, name: "Export Package Builder",            status: "implemented", notes: "manifest.json + per-platform HTML catalog in R2. POST /api/workflows/:id/export." },
  { id: "17", phase: 3, name: "SEO Keyword Research",              status: "implemented", notes: "LLM-derived plan, 24h KV cache by seeds+market." },
  { id: "18", phase: 3, name: "Competitor Intelligence",           status: "implemented", notes: "LLM positioning + Vectorize VEC_COMPETITORS cosine similarity." },
  { id: "19", phase: 4, name: "Prospect Discovery",                status: "implemented", notes: "Compliance-gated. Persists to prospects table." },
  { id: "20", phase: 4, name: "Public Contact Enrichment",         status: "implemented", notes: "Public-sources only; LLM emits empty arrays if nothing found." },
  { id: "21", phase: 4, name: "Transparent CRM Discovery Form",    status: "implemented", notes: "JSON spec stored in R2; purposeStatement is mandatory." },
  { id: "22", phase: 4, name: "Outreach Copy Agent",               status: "implemented", notes: "Compliance/deception flags emitted. Drafts saved as awaiting_approval." },
  { id: "23", phase: 4, name: "Approval + Send Queue",             status: "implemented", notes: "Requires approvedBy when compliance.requireHumanApprovalBeforeSend." },
  { id: "24", phase: 4, name: "Follow-Up Sequence",                status: "implemented", notes: "Cadence-day scheduler with template-key escalation." },
  { id: "25", phase: 4, name: "Lead Temperature Analysis",         status: "implemented", notes: "LLM scores business intent from transcript. Cold/warm/hot + next action." },
  { id: "26", phase: 1, name: "Workflow State + Audit Ledger",     status: "implemented", notes: "D1-backed; every node calls into this." },
];

const PHASE_LABEL: Record<number, string> = {
  1: "Phase 1 — Creative Core",
  2: "Phase 2 — Video + Film",
  3: "Phase 3 — Market Intelligence",
  4: "Phase 4 — Sales Engine",
};

export default function WorkflowSpec() {
  const byPhase = new Map<number, NodeRow[]>();
  for (const n of NODES) {
    const arr = byPhase.get(n.phase) ?? [];
    arr.push(n);
    byPhase.set(n.phase, arr);
  }

  const impl = NODES.filter((n) => n.status === "implemented").length;
  const stub = NODES.filter((n) => n.status === "stub").length;
  const design = NODES.filter((n) => n.status === "design-only").length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-bold">Workflow Spec — 26 Nodes</h2>
        <p className="text-xs text-studio-soft-white/60 mt-1">
          Live status of the multi-agent pipeline. Stubs live under <code className="text-studio-bronze">worker/src/nodes/</code>;
          fill in handlers to flip them green. Schema + audit ledger already implemented.
        </p>
        <div className="flex gap-4 mt-3 text-[11px] font-mono">
          <span className="text-green-400">✓ {impl} implemented</span>
          <span className="text-yellow-400">◐ {stub} stub</span>
          <span className="text-studio-soft-white/40">○ {design} design-only</span>
        </div>
      </div>

      {[1, 2, 3, 4].map((p) => (
        <div key={p}>
          <div className="text-xs font-mono uppercase text-studio-bronze mb-2">{PHASE_LABEL[p]}</div>
          <div className="space-y-1.5">
            {(byPhase.get(p) ?? []).map((n) => (
              <div key={n.id} className="studio-glass rounded p-3 flex items-start gap-3">
                <StatusIcon status={n.status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[10px] font-mono text-studio-soft-white/40">Node {n.id}</span>
                    <span className="text-sm font-medium">{n.name}</span>
                  </div>
                  {n.notes && <div className="text-[11px] text-studio-soft-white/60 mt-1">{n.notes}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "implemented") return <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />;
  if (status === "stub") return <Clock className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />;
  return <AlertTriangle className="w-4 h-4 text-studio-soft-white/40 shrink-0 mt-0.5" />;
}
