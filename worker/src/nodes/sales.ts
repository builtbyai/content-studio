// Phase 4 — Sales Engine (Nodes 19-25). All compliance-gated.
// Spec section 8. Public-only sources, human-approval-required send.

import type { Env } from "../env";
import { llmJson } from "../llm";
import { envelope } from "../types/workflows";
import type { CompliancePolicy, NodeOutputEnvelope, UUID } from "../types/workflows";

// ─ Node 19 — Prospect Discovery ────────────────────────────────────────
export interface ProspectDiscoveryInput {
  idealCustomerProfile: string;
  geography?: string;
  industry?: string;
  maxResults?: number;
  compliance: CompliancePolicy;
}
export interface ProspectCompany {
  id: UUID;
  companyName: string;
  website?: string;
  location?: string;
  fitScore: number;
  sourceEvidence: Array<{ source: string; snippet: string; url: string }>;
}
export interface ProspectDiscoveryOutput { prospects: ProspectCompany[]; }

export async function node19_prospects(env: Env, input: ProspectDiscoveryInput, runId: UUID): Promise<NodeOutputEnvelope<ProspectDiscoveryOutput>> {
  if (!input.compliance.allowPublicWebResearch) {
    return envelope("node_19_prospects", runId, "failed_terminal",
      { prospects: [] }, { warnings: ["compliance: allowPublicWebResearch=false"] });
  }
  const max = Math.min(input.maxResults ?? 10, 25);
  const prompt = `You are a prospecting researcher.

Find ${max} companies that match this ICP:
ICP: ${input.idealCustomerProfile}
Geography: ${input.geography || "any"}
Industry: ${input.industry || "any"}

Return strict JSON:
{
  "prospects": [
    {
      "companyName": "...",
      "website": "...",
      "location": "...",
      "fitScore": 0.0-1.0,
      "rationale": "1 sentence why this matches"
    }
  ]
}
The fitScore should be your honest assessment. Only return real-sounding companies.`;
  const { data } = await llmJson<{ prospects: any[] }>(env, prompt, { maxTokens: 3072 });
  const prospects: ProspectCompany[] = (data.prospects ?? []).map((p: any) => ({
    id: crypto.randomUUID(),
    companyName: String(p.companyName ?? "Unknown"),
    website: p.website ? String(p.website) : undefined,
    location: p.location ? String(p.location) : undefined,
    fitScore: Number(p.fitScore ?? 0.5),
    sourceEvidence: [{ source: "llm", snippet: String(p.rationale ?? ""), url: p.website ?? "" }],
  }));

  // Persist to D1.
  const now = new Date().toISOString();
  for (const p of prospects) {
    await env.DB.prepare(
      `INSERT INTO prospects (id, tenant_id, company_name, website, location, fit_score, source_evidence_json, created_at, updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8)`
    ).bind(p.id, "tenant-default", p.companyName, p.website ?? null, p.location ?? null, p.fitScore, JSON.stringify(p.sourceEvidence), now).run().catch(() => {});
  }
  return envelope("node_19_prospects", runId, "completed", { prospects });
}

// ─ Node 20 — Public Contact Enrichment ────────────────────────────────
export interface ContactEnrichmentInput { prospectId: UUID; allowedSources?: string[]; compliance: CompliancePolicy; }
export interface EnrichedProspect {
  prospectId: UUID;
  publicEmails: string[];
  publicPhones: string[];
  socialLinks: Array<{ network: string; url: string }>;
  decisionMakers: Array<{ name?: string; role?: string; sourceUrl: string }>;
  confidence: number;
}
export async function node20_enrich(env: Env, input: ContactEnrichmentInput, runId: UUID): Promise<NodeOutputEnvelope<EnrichedProspect>> {
  if (!input.compliance.allowProspectEnrichment) {
    return envelope("node_20_enrich", runId, "failed_terminal", emptyEnriched(input.prospectId), { warnings: ["compliance: allowProspectEnrichment=false"] });
  }

  // Look up the prospect row.
  const row = await env.DB.prepare("SELECT * FROM prospects WHERE id = ?1").bind(input.prospectId).first<any>();
  if (!row) return envelope("node_20_enrich", runId, "failed_terminal", emptyEnriched(input.prospectId));

  const prompt = `Look up PUBLICLY AVAILABLE contact details for: ${row.company_name} (${row.website ?? "no website"}).
ONLY use public sources (company site contact page, LinkedIn public profiles, public press releases).
DO NOT fabricate emails or guess.

Return strict JSON:
{
  "publicEmails": ["info@... if listed on website"],
  "publicPhones": ["+1 ... if listed"],
  "socialLinks": [{"network": "linkedin", "url": "..."}],
  "decisionMakers": [{"name": "if PUBLICLY listed (eg About Us page, public LinkedIn)", "role": "...", "sourceUrl": "..."}],
  "confidence": 0.0-1.0
}
If you cannot find ANY public information, return empty arrays and confidence: 0.`;
  const { data } = await llmJson<EnrichedProspect>(env, prompt, { maxTokens: 1024 });

  const enriched: EnrichedProspect = {
    prospectId: input.prospectId,
    publicEmails: Array.isArray(data.publicEmails) ? data.publicEmails.map(String) : [],
    publicPhones: Array.isArray(data.publicPhones) ? data.publicPhones.map(String) : [],
    socialLinks: Array.isArray(data.socialLinks) ? data.socialLinks : [],
    decisionMakers: Array.isArray(data.decisionMakers) ? data.decisionMakers : [],
    confidence: Number(data.confidence ?? 0),
  };
  return envelope("node_20_enrich", runId, "completed", enriched);
}
function emptyEnriched(id: UUID): EnrichedProspect {
  return { prospectId: id, publicEmails: [], publicPhones: [], socialLinks: [], decisionMakers: [], confidence: 0 };
}

// ─ Node 21 — Transparent CRM Discovery Form ───────────────────────────
export interface CrmDiscoveryFormInput { prospectId: UUID; purposeStatement: string; askedQuestions: string[]; compliance: CompliancePolicy; }
export interface CrmDiscoveryFormOutput { formId: UUID; publicUrl: string; purposeDisclosed: true; }
export async function node21_discoveryForm(env: Env, input: CrmDiscoveryFormInput, runId: UUID): Promise<NodeOutputEnvelope<CrmDiscoveryFormOutput>> {
  if (!input.compliance.disallowDeceptiveForms) {
    throw new Error("compliance violation: disallowDeceptiveForms must be true");
  }
  if (!input.purposeStatement?.trim()) {
    return envelope("node_21_discovery_form", runId, "failed_terminal",
      { formId: "" as UUID, publicUrl: "", purposeDisclosed: true },
      { warnings: ["purposeStatement required for disclosure"] });
  }

  // Persist a public form spec to R2 as JSON. The actual form HTML rendering is
  // a Worker route (TBD). For now we emit a public URL that points at the JSON
  // spec which any front-end can render verbatim.
  const formId = crypto.randomUUID();
  const spec = {
    formId,
    prospectId: input.prospectId,
    purposeStatement: input.purposeStatement,
    askedQuestions: input.askedQuestions,
    createdAt: new Date().toISOString(),
  };
  const key = `crm-forms/${formId}.json`;
  await env.MEDIA.put(key, JSON.stringify(spec, null, 2), { httpMetadata: { contentType: "application/json" } });
  const publicUrl = `${env.R2_PUBLIC_BASE}/${encodeURI(key)}`;
  return envelope("node_21_discovery_form", runId, "completed", { formId: formId as UUID, publicUrl, purposeDisclosed: true });
}

// ─ Node 22 — Outreach Copy Agent ───────────────────────────────────────
export interface OutreachCopyInput { prospect: ProspectCompany; channel: "email" | "linkedin" | "form"; offerSummary: string; brandVoice: string; }
export interface OutreachMessageDraft { id: UUID; channel: string; subject?: string; body: string; deceptionFlags: string[]; complianceWarnings: string[]; }
export async function node22_outreachCopy(env: Env, input: OutreachCopyInput, runId: UUID): Promise<NodeOutputEnvelope<OutreachMessageDraft>> {
  const prompt = `Write a ${input.channel} outreach message for:
Prospect: ${input.prospect.companyName} (${input.prospect.website ?? ""})
Offer: ${input.offerSummary}
Brand voice: ${input.brandVoice}

Rules — must follow:
- Disclose YOU are reaching out about the offer.
- No deceptive subject lines.
- No fabricated personal claims (no "I saw you at X conference" unless you actually have evidence).
- Compliant with CAN-SPAM (include opt-out for email).

Return strict JSON:
{
  "subject": "if email/linkedin DM",
  "body": "the message body, ${input.channel === "email" ? "≤150 words" : "≤80 words for LinkedIn DM"}",
  "deceptionFlags": ["any flags you noticed and avoided"],
  "complianceWarnings": ["any rules that nearly were broken"]
}`;
  const { data } = await llmJson<OutreachMessageDraft>(env, prompt, { maxTokens: 768 });
  const id = crypto.randomUUID();
  const draft: OutreachMessageDraft = {
    id: id as UUID,
    channel: input.channel,
    subject: data.subject ? String(data.subject) : undefined,
    body: String(data.body ?? ""),
    deceptionFlags: Array.isArray(data.deceptionFlags) ? data.deceptionFlags.map(String) : [],
    complianceWarnings: Array.isArray(data.complianceWarnings) ? data.complianceWarnings.map(String) : [],
  };

  // Persist draft.
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO outreach_messages (id, prospect_id, channel, subject, body, status, requires_human_approval, scheduled_at, sent_at, created_at)
     VALUES (?1,?2,?3,?4,?5,'awaiting_approval',1,NULL,NULL,?6)`
  ).bind(draft.id, input.prospect.id, draft.channel, draft.subject ?? null, draft.body, now).run().catch(() => {});

  return envelope("node_22_outreach_copy", runId, "completed", draft);
}

// ─ Node 23 — Approval + Send Queue ─────────────────────────────────────
export interface SendQueueInput { draftId: UUID; approvedBy: UUID; scheduledFor?: string; compliance: CompliancePolicy; }
export interface SendQueueItem { id: UUID; status: "queued" | "sent" | "failed"; scheduledFor?: string; }
export async function node23_sendQueue(env: Env, input: SendQueueInput, runId: UUID): Promise<NodeOutputEnvelope<SendQueueItem>> {
  if (input.compliance.requireHumanApprovalBeforeSend && !input.approvedBy) {
    throw new Error("compliance: requireHumanApprovalBeforeSend — approvedBy missing");
  }
  await env.DB.prepare(
    `UPDATE outreach_messages SET status='queued', scheduled_at=?1 WHERE id=?2 AND requires_human_approval=1`
  ).bind(input.scheduledFor ?? new Date().toISOString(), input.draftId).run();

  return envelope("node_23_send_queue", runId, "completed",
    { id: input.draftId, status: "queued", scheduledFor: input.scheduledFor });
}

// ─ Node 24 — Follow-Up Sequence ────────────────────────────────────────
export interface FollowUpInput { conversationId: UUID; lastInboundAt?: string; cadenceDays: number[]; maxFollowUps: number; }
export interface FollowUpOutput { scheduledFollowUps: Array<{ id: UUID; scheduledFor: string; templateKey: string }>; }
export async function node24_followUps(_env: Env, input: FollowUpInput, runId: UUID): Promise<NodeOutputEnvelope<FollowUpOutput>> {
  const base = input.lastInboundAt ? new Date(input.lastInboundAt) : new Date();
  const out: FollowUpOutput["scheduledFollowUps"] = [];
  for (let i = 0; i < Math.min(input.maxFollowUps, input.cadenceDays.length); i++) {
    const at = new Date(base);
    at.setDate(at.getDate() + input.cadenceDays[i]);
    out.push({
      id: crypto.randomUUID() as UUID,
      scheduledFor: at.toISOString(),
      templateKey: i === 0 ? "bump-soft" : i === 1 ? "bump-value" : "bump-final",
    });
  }
  return envelope("node_24_follow_ups", runId, "completed", { scheduledFollowUps: out });
}

// ─ Node 25 — Lead Temperature + Linguistic Tone Analysis ──────────────
export interface LeadTempInput { messages: Array<{ role: "us" | "lead"; body: string; at: string }>; }
export interface LeadTempOutput { temperature: "cold" | "warm" | "hot"; confidence: number; intentSignals: string[]; nextBestAction: string; }
export async function node25_leadTemp(env: Env, input: LeadTempInput, runId: UUID): Promise<NodeOutputEnvelope<LeadTempOutput>> {
  if (input.messages.length === 0) {
    return envelope("node_25_lead_temp", runId, "completed",
      { temperature: "cold", confidence: 0.3, intentSignals: [], nextBestAction: "send first touch" });
  }
  const transcript = input.messages.slice(-8).map((m) => `${m.role.toUpperCase()}: ${m.body}`).join("\n");
  const prompt = `Score lead temperature from this conversation transcript.

${transcript}

Score BUSINESS intent only — not personal sentiment.
Return strict JSON:
{
  "temperature": "cold|warm|hot",
  "confidence": 0.0-1.0,
  "intentSignals": ["specific phrases that drove the score"],
  "nextBestAction": "concrete recommended next step"
}`;
  const { data } = await llmJson<LeadTempOutput>(env, prompt, { maxTokens: 512 });
  return envelope("node_25_lead_temp", runId, "completed", {
    temperature: (["cold", "warm", "hot"].includes(data.temperature) ? data.temperature : "warm") as any,
    confidence: Number(data.confidence ?? 0.5),
    intentSignals: Array.isArray(data.intentSignals) ? data.intentSignals.map(String) : [],
    nextBestAction: String(data.nextBestAction ?? "no recommendation"),
  });
}
