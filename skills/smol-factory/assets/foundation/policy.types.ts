/** Declarative agent policy. Types improve precision; they do not enforce tool access. */
export type LocalPermission = "automatic" | "requireApproval" | "disabled";
export type PublicOperation =
  | "changeLabels" | "createLabel" | "postComment" | "updateComment"
  | "close" | "reopen" | "submitReview" | "merge";
export type ItemKind = "issue" | "pullRequest";
export type StageOutcome = "passed" | "needsInformation" | "blocked" | "rejected";
export type WorkerRole = "assessment" | "review" | "verification";

export interface MaintainerDecision {
  actor: string;
  at: string;
  /** Actual user instruction, not an agent-authored paraphrase presented as approval. */
  statement: string;
}

export interface IntakePolicy {
  limit: number;
  resumeFirst: true;
  newItemOrder: "oldestFirst" | "newestFirst";
  includeDrafts: boolean;
  includeTeamAuthors: boolean;
  excludeAuthors: readonly string[];
  excludeLabels: readonly string[];
  /** Additional GitHub search filters; explicit request filters also apply. */
  search: string;
}

export interface WorkerPolicy {
  maxConcurrent: number;
  preference: "economical" | "thorough" | "precise";
  /** null means choose an available model for the preference; never invent model IDs. */
  model: string | null;
  reasoning: string | null;
}

export interface SubmissionRequirement {
  id: string;
  appliesTo: "issues" | "pullRequests" | "both";
  kind: "requiredFields" | "linkedIssue" | "eligibility" | "custom";
  enabled: boolean;
  fields: readonly string[];
  /** The actual repository rule, not permission inferred from a reference. */
  rule: string;
  references: readonly string[];
  onFailure: "needsInformation" | "rejected";
}

interface StageBase {
  id: string;
  title: string;
  workerRole: WorkerRole;
  references: readonly [string, ...string[]];
  requirements: readonly string[];
  terminal: boolean;
}

/** Read-only stages cannot declare execution permission, even in custom workflows. */
export type Stage = StageBase & (
  | { kind: "verification"; execution: "readOnly" | "verification" }
  | { kind: "validation" | "classification" | "review" | "ready" | "custom"; execution: "readOnly" }
);

export interface Transition {
  from: string;
  to: string;
  when: { outcome: "passed"; verification: "any" | "required" | "notRequired" };
  permission: LocalPermission;
}

export interface Workflow {
  entry: string;
  entryPermission: LocalPermission;
  stages: readonly [Stage, ...Stage[]];
  transitions: readonly Transition[];
}

export interface VerificationEnvironment {
  id: string;
  kind: "source" | "services";
  /** Actual version evidence, e.g. manifest path or API version endpoint. */
  versions: readonly { component: string; source: string }[];
  requiredVariables: readonly string[];
  references: readonly string[];
}

export interface VerificationCommand {
  id: string;
  argv: readonly [string, ...string[]];
  cwd: string;
  environment: string;
  permission: LocalPermission;
  timeoutSeconds: number;
  appliesTo: readonly string[];
  cleanupCommand: string | null;
}

export interface LabelDefinition { name: string; color: string; description: string }

export interface LabelPolicy {
  /** Only these labels may be removed by workflow label changes. */
  managed: readonly string[];
  definitions: readonly LabelDefinition[];
  stages: {
    issues: Readonly<Record<string, string>>;
    pullRequests: Readonly<Record<string, string>>;
  };
  dispositions: { needsInformation: string; blocked: string; rejected: string };
  categories: readonly string[];
}

export interface CommentTemplate {
  id: string;
  body: string;
  /** Use {{variable}} placeholders. Values must be evidence-backed; no extra prose. */
  variables: readonly string[];
}

export type GrantCondition =
  | { type: "missingFields"; requirement: string; fields: readonly string[] }
  | { type: "stageOutcome"; stage: string; outcome: StageOutcome }
  | { type: "hasLabels"; labels: readonly string[] }
  | { type: "state"; state: "open" | "closed" };

/** Exact effects; freeform comments never match a template grant. */
export type GrantedAction =
  | { operation: "changeLabels"; add: readonly string[]; remove: readonly string[] }
  | { operation: "createLabel"; label: LabelDefinition }
  | { operation: "postComment"; template: string }
  | { operation: "updateComment"; template: string; target: "publishedSummary" }
  | { operation: "close"; reason: "completed" | "notPlanned" }
  | { operation: "reopen" }
  | { operation: "submitReview"; event: "approve" | "requestChanges" | "comment"; template: string }
  | { operation: "merge"; method: "merge" | "squash" | "rebase" };

export interface PublicGrant {
  id: string;
  appliesTo: "issues" | "pullRequests" | "both";
  /** All conditions must match. */
  when: readonly [GrantCondition, ...GrantCondition[]];
  actions: readonly [GrantedAction, ...GrantedAction[]];
  accepted: MaintainerDecision;
}

export interface FactoryPolicy {
  schemaVersion: 1;
  repository: { name: `${string}/${string}`; githubHost: string; defaultBranch: string };
  /** null is an onboarding draft, never authority to start a scan. */
  accepted: MaintainerDecision | null;
  context: string;
  operations: string;
  records: string;
  intake: { issues: IntakePolicy; pullRequests: IntakePolicy };
  workers: {
    maxConcurrent: number;
    roles: Readonly<Record<WorkerRole, WorkerPolicy>>;
    fallbackWithoutDelegation: "serial";
  };
  requirements: readonly SubmissionRequirement[];
  workflows: { issues: Workflow; pullRequests: Workflow };
  verification: {
    permission: LocalPermission;
    workspace: "isolated";
    mutations: "none" | "isolatedOnly" | "requireApproval";
    cleanupRequired: true;
    environments: readonly VerificationEnvironment[];
    commands: readonly VerificationCommand[];
  };
  contributorEdits: "deny" | "requireApproval";
  labels: LabelPolicy;
  github: {
    /** A grant may satisfy requireApproval. deny takes precedence over every grant. */
    operations: Readonly<Record<PublicOperation, "requireApproval" | "deny">>;
    templates: readonly CommentTemplate[];
    grants: readonly PublicGrant[];
  };
  history: { issues: number; mergedPullRequests: number; closedPullRequests: number };
}
