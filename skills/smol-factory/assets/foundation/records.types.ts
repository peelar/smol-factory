import type { ItemKind, MaintainerDecision, PublicOperation, StageOutcome } from "./policy.types.js";

export interface Evidence {
  kind: "observation" | "inference" | "unknown";
  source: string;
  detail: string;
}

export interface ItemSnapshot {
  capturedAt: string;
  state: "open" | "closed" | "merged";
  title: string;
  bodyDigest: string;
  commentsDigest: string;
  labels: readonly string[];
  /** null for issues; both commits required for PRs. */
  headCommit: string | null;
  baseCommit: string | null;
}

export interface EnvironmentEvidence {
  id: string;
  sourceCommit: string;
  components: readonly { name: string; version: string; source: string }[];
  /** Redact addresses if sensitive; never store credentials. */
  description: string;
  isolation: string;
  cleanup: "notNeeded" | "pending" | "completed" | "blocked";
}

export interface AssessmentBasis {
  snapshot: ItemSnapshot;
  policyDigest: string;
  references: readonly { path: string; digest: string }[];
  sourceCommit: string;
  environment: EnvironmentEvidence | null;
}

export interface StageResult {
  id: string;
  stage: string;
  status: "running" | StageOutcome | "stale";
  startedAt: string;
  finishedAt: string | null;
  basis: AssessmentBasis;
  summary: string;
  evidence: readonly Evidence[];
  /** Verification result, independent of whether the investigation completed. */
  verification: "notApplicable" | "confirmed" | "alreadyFixed" | "notReproduced" | "checksPassed" | "checksFailed" | "incomplete";
  checks: readonly CheckResult[];
}

export interface CheckResult {
  command: string;
  environment: string;
  status: "planned" | "passed" | "failed" | "blocked";
  evidence: readonly Evidence[];
}

export interface StageAuthorization {
  id: string;
  stage: string;
  scope: "entry" | "transition" | "verification" | "mutation";
  basis: AssessmentBasis;
  commands: readonly string[];
  environments: readonly string[];
  /** Exact approved fixture/mutation scope, if any. */
  mutations: string | null;
  decision: MaintainerDecision;
}

/** Exact rendered payload, not just a template name or suggested action. */
export type PublicActionPayload =
  | { operation: "changeLabels"; add: readonly string[]; remove: readonly string[] }
  | { operation: "createLabel"; name: string; color: string; description: string }
  | { operation: "postComment"; body: string }
  | { operation: "updateComment"; commentId: string; beforeDigest: string; body: string }
  | { operation: "close"; reason: "completed" | "notPlanned" | null }
  | { operation: "reopen" }
  | { operation: "submitReview"; event: "approve" | "requestChanges" | "comment"; body: string; headCommit: string }
  | { operation: "merge"; method: "merge" | "squash" | "rebase"; headCommit: string };

export type PublicAction = PublicActionPayload & { id: string };

export type ActionAuthorization =
  | { kind: "pending" }
  | { kind: "user"; decision: MaintainerDecision; actionIds: readonly string[]; proposalDigest: string }
  | { kind: "grant"; grantId: string; actionIds: readonly string[]; policyDigest: string; proposalDigest: string };

export interface OperationReceipt {
  actionId: string;
  operation: PublicOperation;
  status: "started" | "succeeded" | "failed" | "uncertain";
  at: string;
  remoteId: string | null;
  remoteUrl: string | null;
  detail: string;
}

export interface Proposal {
  id: string;
  createdAt: string;
  digest: string;
  basis: AssessmentBasis;
  actions: readonly PublicAction[];
  /** Different selections may have different authorizations. */
  authorizations: readonly ActionAuthorization[];
  receipts: readonly OperationReceipt[];
  status: "pending" | "partiallyApplied" | "applied" | "stale" | "uncertain";
}

export interface HistoryEvent {
  at: string;
  type: "started" | "result" | "blocked" | "resumed" | "invalidated" | "approval" | "published";
  stage: string | null;
  detail: string;
  decision: MaintainerDecision | null;
}

export interface ItemRecord {
  schemaVersion: 1;
  repository: { name: `${string}/${string}`; githubHost: string };
  item: { kind: ItemKind; number: number; url: string };
  updatedAt: string;
  snapshot: ItemSnapshot;
  currentStage: string | null;
  disposition: "pending" | "running" | "needsInformation" | "blocked" | "rejected" | "ready";
  verificationNeed: "required" | "notRequired" | "undetermined";
  understanding: "understanding.md";
  stageAuthorizations: readonly StageAuthorization[];
  results: readonly StageResult[];
  proposals: readonly Proposal[];
  history: readonly HistoryEvent[];
  /** Pointer to the last approved public understanding summary, if any. */
  publishedSummary: { commentId: string; url: string; bodyDigest: string; proposalId: string } | null;
}
