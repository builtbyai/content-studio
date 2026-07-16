// Global workflow types — mirrors §4 of multi_model_workflow_studio_architecture_spec.md.
// Single source of truth: every node imports its I/O types from here or its sibling
// module under nodes/. Versioned: bump SCHEMA_VERSION when a breaking change lands.

export const SCHEMA_VERSION = 1;

export type UUID = string;
export type ISODateTime = string;
export type ProviderId = "openai" | "gemini" | "runway" | "openrouter" | "workers-ai" | "google-ai-studio" | "replicate" | "custom";
export type MediaType = "image" | "video" | "text" | "html" | "pdf" | "json" | "csv";
export type WorkflowMode = "draft" | "estimate_only" | "execute" | "review_only" | "export_only";

export type NodeState =
  | "idle"
  | "queued"
  | "validating"
  | "running"
  | "waiting_on_provider"
  | "review_required"
  | "retry_scheduled"
  | "completed"
  | "failed_recoverable"
  | "failed_terminal"
  | "skipped"
  | "cancelled";

export interface WorkflowContext {
  workflowId: UUID;
  tenantId: UUID;
  userId: UUID;
  mode: WorkflowMode;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  timezone: string;
  budget: BudgetEnvelope;
  brandProfile?: BrandProfile;
  providerPolicy: ProviderPolicy;
  compliancePolicy: CompliancePolicy;
  audit: AuditEvent[];
}

export interface BudgetEnvelope {
  currency: "USD";
  maxTotalCostUsd: number;
  maxNodeCostUsd: number;
  warnAtPercent: number;
  hardStopAtPercent: number;
  allowOverage: boolean;
}

export const DEFAULT_BUDGET: BudgetEnvelope = {
  currency: "USD",
  maxTotalCostUsd: 25,
  maxNodeCostUsd: 5,
  warnAtPercent: 0.75,
  hardStopAtPercent: 1.0,
  allowOverage: false,
};

export interface ProviderPolicy {
  allowedProviders: ProviderId[];
  preferredProviders: ProviderId[];
  blockedProviders: ProviderId[];
  parallelism: {
    maxConcurrentProviders: number;
    maxConcurrentJobsPerProvider: number;
  };
  fallbackOrder: ProviderId[];
}

export const DEFAULT_PROVIDER_POLICY: ProviderPolicy = {
  allowedProviders: ["openai", "gemini", "runway", "openrouter", "workers-ai"],
  preferredProviders: ["gemini", "openai"],
  blockedProviders: [],
  parallelism: { maxConcurrentProviders: 3, maxConcurrentJobsPerProvider: 2 },
  fallbackOrder: ["gemini", "openai", "openrouter"],
};

export interface CompliancePolicy {
  allowPublicWebResearch: boolean;
  allowProspectEnrichment: boolean;
  allowAutomatedOutreach: boolean;
  requireHumanApprovalBeforeSend: boolean;
  disallowDeceptiveForms: boolean; // must remain true
  piiRetentionDays: number;
}

export const DEFAULT_COMPLIANCE_POLICY: CompliancePolicy = {
  allowPublicWebResearch: true,
  allowProspectEnrichment: true,
  allowAutomatedOutreach: false,
  requireHumanApprovalBeforeSend: true,
  disallowDeceptiveForms: true,
  piiRetentionDays: 30,
};

export interface AuditEvent {
  eventId: UUID;
  workflowId: UUID;
  nodeId: string;
  state: NodeState;
  message: string;
  timestamp: ISODateTime;
  metadata?: Record<string, unknown>;
}

export interface BrandProfile {
  id: UUID;
  name: string;
  voice: string;
  palette: string[];      // hex codes
  logoAssetIds: UUID[];
  forbiddenClaims: string[];
  productReferences: ProductReference[];
}

export interface ProductReference {
  id: UUID;
  label: string;
  assetIds: UUID[];
  mustPreserve: boolean;
}

export interface AssetRequirement {
  kind: "image" | "video" | "logo" | "font" | "data";
  description: string;
  required: boolean;
}

export interface PlatformRequirement {
  platform: "linkedin" | "instagram" | "tiktok" | "youtube" | "x" | "facebook" | "threads";
  aspectRatio: string;       // "1:1" | "9:16" | "16:9" | ...
  durationSeconds?: number;
  maxFileBytes?: number;
}

// --- Failure policy ---
export interface FailurePolicy {
  timeoutMs: number;
  maxRetries: number;
  retryBackoffMs: number;
  retryBackoffMultiplier: number;
  retryJitterRatio: number;
  circuitBreakerFailureCount: number;
  circuitBreakerWindowMs: number;
  fallbackEnabled: boolean;
  humanReviewThreshold: number;
}

export const DEFAULT_FAILURE_POLICY: FailurePolicy = {
  timeoutMs: 90_000,
  maxRetries: 2,
  retryBackoffMs: 2_000,
  retryBackoffMultiplier: 2.0,
  retryJitterRatio: 0.2,
  circuitBreakerFailureCount: 5,
  circuitBreakerWindowMs: 300_000,
  fallbackEnabled: true,
  humanReviewThreshold: 0.72,
};

// --- Cost ---
export interface CostEstimate {
  providerId: ProviderId;
  modelId: string;
  mediaType: MediaType;
  quantity: number;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
  estimatedImages?: number;
  estimatedVideoSeconds?: number;
  estimatedResolutionMultiplier?: number;
  estimatedToolCalls?: number;
  estimatedCostUsd: number;
  confidence: number; // 0..1
}

// --- Node envelope (every node output wraps in this) ---
export interface NodeOutputEnvelope<T> {
  schemaVersion: number;
  nodeId: string;
  runId: UUID;
  status: NodeState;
  createdAt: ISODateTime;
  data: T;
  costSpent?: CostEstimate;
  warnings?: string[];
}

export function envelope<T>(
  nodeId: string,
  runId: UUID,
  status: NodeState,
  data: T,
  extras?: Partial<NodeOutputEnvelope<T>>
): NodeOutputEnvelope<T> {
  return {
    schemaVersion: SCHEMA_VERSION,
    nodeId,
    runId,
    status,
    createdAt: new Date().toISOString(),
    data,
    ...extras,
  };
}
