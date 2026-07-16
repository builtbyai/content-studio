// WebMCP tool registrations for the ContentForge web client.
//
// Uses the Chrome 149+ `navigator.modelContext` API. All tools route through
// the typed `api` surface in `src/lib/api.ts` so they inherit the same-origin
// cookie session and JSON error handling. Initial shipment is read-only; any
// mutation-shaped tool must be prefixed `experimental:` and reviewed before
// enablement.
//
// Spec contract is contract-isolated here so a future API shape change only
// edits this file. Verified shape (Chrome 149 origin trial, smoke-tested
// 2026-06-28): registerTool({ name, description, inputSchema, execute }) —
// handler receives parsed args. There is NO unregister API in Chrome 149;
// tools live for the document lifetime.

import { api } from "../lib/api";

interface ModelContextToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: any) => Promise<unknown>;
}

interface ModelContext {
  registerTool: (def: ModelContextToolDef) => void;
  getTools: () => Promise<unknown[]>;
  executeTool: (tool: unknown, input: string) => Promise<string>;
}

declare global {
  interface Navigator {
    modelContext?: ModelContext;
  }
}

const TOOL_DEFS: ModelContextToolDef[] = [
  {
    name: "contentforge_listJobs",
    description: "List background generation jobs (Video Lab, Image Lab, Scene Composer, Workflow Composer).",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string" },
        limit: { type: "number", minimum: 1, maximum: 200 },
        since: { type: "number" },
      },
      additionalProperties: false,
    },
    execute: async ({ status, limit, since }: { status?: string; limit?: number; since?: number }) => {
      return api.listJobs({ status, limit, since });
    },
  },
  {
    name: "contentforge_getJob",
    description: "Fetch a single generation job by id.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", minLength: 1 } },
      additionalProperties: false,
    },
    execute: async ({ id }: { id: string }) => api.getJob(id),
  },
  {
    name: "contentforge_getIntelSignals",
    description: "Surface current content-intel signals (read-only).",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number", minimum: 1, maximum: 200 } },
      additionalProperties: false,
    },
    execute: async ({ limit }: { limit?: number }) => api.intelSignals(limit ?? 60),
  },
  {
    name: "contentforge_listArticles",
    description: "Browse content-library articles. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", minimum: 1, maximum: 200 },
        offset: { type: "number", minimum: 0 },
      },
      additionalProperties: false,
    },
    execute: async ({ limit, offset }: { limit?: number; offset?: number }) => {
      return api.listArticles(limit ?? 100, offset ?? 0);
    },
  },
  {
    name: "contentforge_getCostSummary",
    description: "Recent generation cost rollup across providers. Use before any future side-effectful tool.",
    inputSchema: {
      type: "object",
      properties: { days: { type: "number", minimum: 1, maximum: 90 } },
      additionalProperties: false,
    },
    execute: async ({ days }: { days?: number }) => api.costSummary(days ?? 30),
  },
];

function modelContextAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.modelContext?.registerTool === "function"
  );
}

// Registers all ContentForge tools. Idempotent: if a tool name is already
// registered (hot reload, double mount), the InvalidStateError is swallowed.
// Returns a no-op cleanup; Chrome 149 has no unregister surface — tools live
// for the document lifetime.
export function registerContentForgeWebMcpTools(): () => void {
  if (!modelContextAvailable()) return () => {};

  const ctx = navigator.modelContext!;
  for (const def of TOOL_DEFS) {
    try {
      ctx.registerTool(def);
    } catch (err) {
      if (err instanceof DOMException && err.name === "InvalidStateError") continue;
      console.warn("[webmcp] failed to register", def.name, err);
    }
  }
  return () => {};
}

export const __TOOL_DEFS_FOR_TESTS = TOOL_DEFS;
