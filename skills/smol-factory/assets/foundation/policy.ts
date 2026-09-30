import type { FactoryPolicy } from "./policy.types.js";

/** Onboarding replaces identity, requirements, references and verification from evidence. */
export default {
  schemaVersion: 1,
  repository: { name: "owner/repository", githubHost: "github.com", defaultBranch: "main" },
  accepted: null,
  context: ".smol-factory/context.md",
  operations: ".smol-factory/operations.md",
  records: ".smol-factory/records.md",
  intake: {
    issues: {
      limit: 10, resumeFirst: true, newItemOrder: "oldestFirst", includeDrafts: false,
      includeTeamAuthors: true, excludeAuthors: [], excludeLabels: [], search: "",
    },
    pullRequests: {
      limit: 10, resumeFirst: true, newItemOrder: "oldestFirst", includeDrafts: true,
      includeTeamAuthors: true, excludeAuthors: [], excludeLabels: [], search: "",
    },
  },
  workers: {
    maxConcurrent: 3,
    roles: {
      assessment: { maxConcurrent: 3, preference: "economical", model: null, reasoning: null },
      review: { maxConcurrent: 1, preference: "thorough", model: null, reasoning: null },
      verification: { maxConcurrent: 1, preference: "precise", model: null, reasoning: null },
    },
    fallbackWithoutDelegation: "serial",
  },
  // No repository-specific exclusion or linked-issue requirement is invented here.
  requirements: [],
  workflows: {
    issues: {
      entry: "validate", entryPermission: "automatic",
      stages: [
        { id: "validate", title: "Validate submission", kind: "validation", workerRole: "assessment", references: [".smol-factory/stages/validate.md"], requirements: [], execution: "readOnly", terminal: false },
        { id: "classify", title: "Classify and find related history", kind: "classification", workerRole: "assessment", references: [".smol-factory/stages/classify.md"], requirements: [], execution: "readOnly", terminal: false },
        { id: "verify", title: "Verify issue", kind: "verification", workerRole: "verification", references: [".smol-factory/stages/verify.md"], requirements: [], execution: "verification", terminal: false },
        { id: "ready", title: "Ready to be worked on", kind: "ready", workerRole: "assessment", references: [".smol-factory/stages/ready.md"], requirements: [], execution: "readOnly", terminal: true },
      ],
      transitions: [
        { from: "validate", to: "classify", when: { outcome: "passed", verification: "any" }, permission: "automatic" },
        { from: "classify", to: "verify", when: { outcome: "passed", verification: "required" }, permission: "automatic" },
        { from: "classify", to: "ready", when: { outcome: "passed", verification: "notRequired" }, permission: "automatic" },
        { from: "verify", to: "ready", when: { outcome: "passed", verification: "any" }, permission: "automatic" },
      ],
    },
    pullRequests: {
      entry: "validate", entryPermission: "automatic",
      stages: [
        { id: "validate", title: "Validate submission", kind: "validation", workerRole: "assessment", references: [".smol-factory/stages/validate.md"], requirements: [], execution: "readOnly", terminal: false },
        { id: "classify", title: "Classify contribution and product fit", kind: "classification", workerRole: "assessment", references: [".smol-factory/stages/classify.md"], requirements: [], execution: "readOnly", terminal: false },
        { id: "review", title: "Review code", kind: "review", workerRole: "review", references: [".smol-factory/stages/review.md"], requirements: [], execution: "readOnly", terminal: false },
        { id: "verify", title: "Verify change", kind: "verification", workerRole: "verification", references: [".smol-factory/stages/verify.md"], requirements: [], execution: "verification", terminal: false },
        { id: "ready", title: "Ready for maintainer acceptance", kind: "ready", workerRole: "assessment", references: [".smol-factory/stages/ready.md"], requirements: [], execution: "readOnly", terminal: true },
      ],
      transitions: [
        { from: "validate", to: "classify", when: { outcome: "passed", verification: "any" }, permission: "automatic" },
        { from: "classify", to: "review", when: { outcome: "passed", verification: "any" }, permission: "automatic" },
        { from: "review", to: "verify", when: { outcome: "passed", verification: "any" }, permission: "automatic" },
        { from: "verify", to: "ready", when: { outcome: "passed", verification: "any" }, permission: "automatic" },
      ],
    },
  },
  verification: {
    permission: "automatic", workspace: "isolated", mutations: "none", cleanupRequired: true,
    // No commands or environments are authorized until onboarding discovers them.
    environments: [], commands: [],
  },
  contributorEdits: "requireApproval",
  labels: {
    managed: [
      "factory:issue:validate", "factory:issue:classify", "factory:issue:verify", "factory:issue:ready",
      "factory:pr:validate", "factory:pr:classify", "factory:pr:review", "factory:pr:verify", "factory:pr:ready",
      "factory:needs-information", "factory:blocked", "factory:rejected",
    ],
    // Onboarding supplies definitions for missing labels; creating any needs approval.
    definitions: [],
    stages: {
      issues: { validate: "factory:issue:validate", classify: "factory:issue:classify", verify: "factory:issue:verify", ready: "factory:issue:ready" },
      pullRequests: { validate: "factory:pr:validate", classify: "factory:pr:classify", review: "factory:pr:review", verify: "factory:pr:verify", ready: "factory:pr:ready" },
    },
    dispositions: { needsInformation: "factory:needs-information", blocked: "factory:blocked", rejected: "factory:rejected" },
    categories: [],
  },
  github: {
    operations: {
      changeLabels: "requireApproval", createLabel: "requireApproval",
      postComment: "requireApproval", updateComment: "requireApproval",
      close: "requireApproval", reopen: "requireApproval",
      submitReview: "requireApproval", merge: "requireApproval",
    },
    templates: [], grants: [],
  },
  history: { issues: 20, mergedPullRequests: 20, closedPullRequests: 20 },
} satisfies FactoryPolicy;
