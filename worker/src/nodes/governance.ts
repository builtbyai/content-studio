// Node 26 — Workflow State + Audit Ledger.
// Spec section 8. Persisted in D1 (workflows + workflow_nodes + workflow_audit_events).
// Unlike the other node modules, governance is fully implemented because
// every other node calls into it to record progress.

import type { Env } from "../env";
import type {
  AuditEvent, BudgetEnvelope, CompliancePolicy, NodeOutputEnvelope, NodeState,
  ProviderPolicy, UUID, WorkflowContext, WorkflowMode,
} from "../types/workflows";
import { envelope, DEFAULT_BUDGET, DEFAULT_COMPLIANCE_POLICY, DEFAULT_PROVIDER_POLICY } from "../types/workflows";

export interface CreateWorkflowInput {
  tenantId: UUID;
  userId: UUID;
  mode: WorkflowMode;
  timezone?: string;
  budget?: Partial<BudgetEnvelope>;
  providerPolicy?: Partial<ProviderPolicy>;
  compliancePolicy?: Partial<CompliancePolicy>;
}

export const governance = {
  async createWorkflow(env: Env, input: CreateWorkflowInput): Promise<WorkflowContext> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const budget: BudgetEnvelope = { ...DEFAULT_BUDGET, ...input.budget };
    const providerPolicy: ProviderPolicy = { ...DEFAULT_PROVIDER_POLICY, ...input.providerPolicy };
    const compliancePolicy: CompliancePolicy = { ...DEFAULT_COMPLIANCE_POLICY, ...input.compliancePolicy };

    if (!compliancePolicy.disallowDeceptiveForms) {
      throw new Error("compliance violation: disallowDeceptiveForms must remain true");
    }

    await env.DB.prepare(
      `INSERT INTO workflows
         (id, tenant_id, user_id, mode, status, budget_json, provider_policy_json, compliance_policy_json, created_at, updated_at)
       VALUES (?1,?2,?3,?4,'idle',?5,?6,?7,?8,?8)`
    )
      .bind(
        id, input.tenantId, input.userId, input.mode,
        JSON.stringify(budget), JSON.stringify(providerPolicy), JSON.stringify(compliancePolicy),
        now
      )
      .run();

    return {
      workflowId: id, tenantId: input.tenantId, userId: input.userId,
      mode: input.mode, createdAt: now, updatedAt: now,
      timezone: input.timezone ?? "UTC",
      budget, providerPolicy, compliancePolicy, audit: [],
    };
  },

  async getWorkflow(env: Env, workflowId: UUID): Promise<WorkflowContext | null> {
    const row = await env.DB.prepare("SELECT * FROM workflows WHERE id = ?1")
      .bind(workflowId)
      .first<any>();
    if (!row) return null;
    const audit = await this.listAuditEvents(env, workflowId, 200);
    return {
      workflowId: row.id, tenantId: row.tenant_id, userId: row.user_id,
      mode: row.mode, createdAt: row.created_at, updatedAt: row.updated_at,
      timezone: "UTC",
      budget: JSON.parse(row.budget_json),
      providerPolicy: JSON.parse(row.provider_policy_json),
      compliancePolicy: JSON.parse(row.compliance_policy_json),
      audit,
    };
  },

  async listNodes(env: Env, workflowId: UUID) {
    const rs = await env.DB.prepare(
      "SELECT * FROM workflow_nodes WHERE workflow_id = ?1 ORDER BY started_at"
    ).bind(workflowId).all<any>();
    return rs.results ?? [];
  },

  async recordNodeStart(env: Env, args: {
    workflowId: UUID; nodeId: string; runId: UUID; inputHash: string;
    parentNodeIds: string[]; childNodeIds: string[]; userId?: UUID;
  }): Promise<void> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO workflow_nodes
         (id, workflow_id, node_id, run_id, state, input_hash, parent_node_ids_json, child_node_ids_json, started_at)
       VALUES (?1,?2,?3,?4,'running',?5,?6,?7,?8)`
    )
      .bind(id, args.workflowId, args.nodeId, args.runId, args.inputHash,
            JSON.stringify(args.parentNodeIds), JSON.stringify(args.childNodeIds), now)
      .run();
    await this.audit(env, { workflowId: args.workflowId, nodeId: args.nodeId, state: "running", message: "node started" });
    // Fire-and-forget broadcast so the orchestrator doesn't pay DO RPC latency per node.
    this._broadcast(env, args.workflowId, args.userId, {
      kind: "node",
      nodeId: args.nodeId, runId: args.runId, state: "running", at: Date.now(),
    }).catch(() => {});
  },

  async recordNodeFinish(env: Env, args: {
    workflowId: UUID; runId: UUID; state: NodeState; outputHash?: string;
    incrementRetries?: boolean; userId?: UUID; nodeId?: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE workflow_nodes
         SET state = ?1, output_hash = ?2, completed_at = ?3,
             retries = retries + ?4
       WHERE workflow_id = ?5 AND run_id = ?6`
    )
      .bind(args.state, args.outputHash ?? null, now, args.incrementRetries ? 1 : 0,
            args.workflowId, args.runId)
      .run();
    // Resolve nodeId from workflow_nodes if not passed
    let nodeId = args.nodeId;
    if (!nodeId) {
      const row = await env.DB.prepare("SELECT node_id FROM workflow_nodes WHERE run_id = ?1").bind(args.runId).first<{ node_id: string }>();
      nodeId = row?.node_id ?? args.runId;
    }
    await this.audit(env, { workflowId: args.workflowId, nodeId, state: args.state, message: `node finished with state ${args.state}` });
    this._broadcast(env, args.workflowId, args.userId, {
      kind: "node",
      nodeId, runId: args.runId, state: args.state, at: Date.now(),
    }).catch(() => {});
  },

  /** Internal: broadcast node event to the user's SSE room. Looks up userId from workflow if not provided. */
  async _broadcast(env: Env, workflowId: UUID, userId: UUID | undefined, payload: Record<string, unknown>): Promise<void> {
    try {
      let uid = userId;
      if (!uid) {
        const row = await env.DB.prepare("SELECT user_id FROM workflows WHERE id = ?1").bind(workflowId).first<{ user_id: string }>();
        uid = row?.user_id as any;
      }
      if (!uid) return;
      const room = env.SCHEDULE_ROOM.get(env.SCHEDULE_ROOM.idFromName(uid));
      await room.fetch("https://room/broadcast", {
        method: "POST",
        body: JSON.stringify({ ...payload, workflowId }),
      });
    } catch {
      // SSE failures are non-fatal
    }
  },

  async audit(env: Env, e: { workflowId: UUID; nodeId: string; state: NodeState; message: string; metadata?: Record<string, unknown> }): Promise<void> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO workflow_audit_events (id, workflow_id, node_id, state, message, metadata_json, created_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7)`
    )
      .bind(id, e.workflowId, e.nodeId, e.state, e.message, e.metadata ? JSON.stringify(e.metadata) : null, now)
      .run();
  },

  async listAuditEvents(env: Env, workflowId: UUID, limit = 100): Promise<AuditEvent[]> {
    const rs = await env.DB.prepare(
      "SELECT * FROM workflow_audit_events WHERE workflow_id = ?1 ORDER BY created_at DESC LIMIT ?2"
    ).bind(workflowId, limit).all<any>();
    return (rs.results ?? []).map((r) => ({
      eventId: r.id,
      workflowId: r.workflow_id,
      nodeId: r.node_id,
      state: r.state as NodeState,
      message: r.message,
      timestamp: r.created_at,
      metadata: r.metadata_json ? JSON.parse(r.metadata_json) : undefined,
    }));
  },
};

export type Node26Output = NodeOutputEnvelope<{ ledgerRecorded: true }>;
export function node26_ledger(workflowId: UUID, _runId: UUID): Node26Output {
  return envelope("node_26_ledger", _runId, "completed", { ledgerRecorded: true }, { warnings: [`ledger for ${workflowId}`] });
}
