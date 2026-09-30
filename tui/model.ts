import {
  assessment,
  currentGate,
  overall,
  stageStatus,
  type StageStatus,
} from "../src/assessment";
export {
  currentGate,
  overall,
  stageStatus,
  type StageStatus,
} from "../src/assessment";
import { gates, type Gate, type PullRequest } from "../src/schema";
export { gates, prSchema, type Gate, type PullRequest } from "../src/schema";
import type { IssueRun } from "../src/issue-runs";
import type { Proposal } from "../src/workflow";
import type { QueueAction } from "./actions";
export interface Snapshot {
  browse?: {
    kind: "issue" | "pr";
    page: number;
    total: number;
    items: { number: number; title: string; author: string; url: string }[];
  };
  proposals?: Proposal[];
  issueRuns?: IssueRun[];
  collected?: { kind: "issue" | "pr"; number: number }[];
  scanRuns?: { id: string; prs: number[]; pending: number[] }[];
  prs: PullRequest[];
  warnings: string[];
  latestScan?: { id: string; created: string; prs: number[] };
  models: Partial<Record<Gate, string>>;
}
export interface PrPreview {
  number: number;
  head: string;
  body: string;
  files: { path: string; status: string; patch: string | null }[];
}
export function browsePrimary(
  snapshot: Snapshot,
  kind: "issue" | "pr",
  number: number,
  preview?: PrPreview,
): {
  title: string;
  detail: string;
  action?: QueueAction;
} {
  const classify = (again = false) =>
    preview?.number === number
      ? {
          title: `${again ? "Reclassify" : "Classify"} PR #${number}?`,
          detail:
            "Classify the revision shown in the preview. GitHub evidence is checked again before the agent runs.",
          action: {
            kind: "classify-target" as const,
            number,
            head: preview.head,
          },
        }
      : {
          title: `Loading PR #${number}…`,
          detail:
            "Wait for the PR description and changed files before classifying.",
        };
  const pr =
    kind === "pr"
      ? snapshot.prs.find((item) => item.number === number)
      : undefined;
  if (pr) {
    const next = assessment(pr).next;
    if (next.action === "rescan") return classify(true);
    if (next.action === "classify_scan") {
      return classify();
    }
    const preview = previewAction(pr);
    if (preview)
      return {
        ...preview,
        action:
          next.action === "approve" || next.action === "launch"
            ? {
                kind: next.action,
                number,
                gate: currentGate(pr),
                fingerprint: pr.fingerprint,
              }
            : undefined,
      };
    return { title: `PR #${number}`, detail: next.reason };
  }
  const issueRun =
    kind === "issue" ? latestIssueRun(snapshot, number) : undefined;
  if (issueRun && issueRun.status !== "completed")
    return {
      title: `Issue #${number} · ${issueRun.stage} · ${issueRun.status}`,
      detail: issueRun.events.at(-1)?.detail ?? "",
    };
  const entries = (snapshot.proposals ?? []).flatMap((proposal) =>
    proposal.entries
      .filter(
        (entry) => entry.target.kind === kind && entry.target.number === number,
      )
      .map((entry) => ({ proposal, entry })),
  );
  if (entries.length)
    return {
      title: `Review proposals for ${kind} #${number}`,
      detail:
        "Review the exact actions with your agent. Approval must name selected entry IDs and record your actual instruction.",
    };
  if (
    snapshot.collected?.some(
      (item) => item.kind === kind && item.number === number,
    )
  )
    return {
      title: `${kind === "issue" ? "Issue" : "PR"} #${number} awaiting assessment`,
      detail:
        "Ask your agent to assess the saved evidence and prepare exact proposals.",
    };
  return kind === "pr"
    ? classify()
    : {
        title: `Collect issue #${number}?`,
        detail: "Capture this issue for agent assessment.",
        action: { kind: "collect-issue", number },
      };
}
export const visuals: Record<
  StageStatus,
  { label: string; icon: string; color: string }
> = {
  waiting: { label: "Not started", icon: "·", color: "#7c8598" },
  running: { label: "Running", icon: "◉", color: "#82aaff" },
  passed: { label: "Needs approval", icon: "?", color: "#f9d78c" },
  approved: { label: "Approved", icon: "✓", color: "#a6d9a0" },
  blocked: { label: "Blocked", icon: "×", color: "#ed8796" },
  decision: { label: "Needs decision", icon: "!", color: "#f9d78c" },
  stale: { label: "Stale", icon: "↺", color: "#c6a0f6" },
  queued: { label: "Queued", icon: "○", color: "#82aaff" },
  failed: { label: "Interrupted / failed", icon: "!", color: "#ed8796" },
};
export const filters = [
  "All PRs",
  "Needs me",
  "Running",
  "Blocked",
  "Completed",
  "Latest scan",
] as const;
export type Filter = (typeof filters)[number];
export function selectPrs(snapshot: Snapshot, filter: Filter): PullRequest[] {
  const rank: Record<StageStatus, number> = {
    passed: 0,
    decision: 1,
    blocked: 2,
    stale: 3,
    failed: 3,
    running: 4,
    queued: 5,
    waiting: 6,
    approved: 7,
  };
  return snapshot.prs
    .filter((pr) => {
      const status = overall(pr);
      return (
        filter === "All PRs" ||
        (filter === "Needs me" && assessment(pr).needs_maintainer) ||
        (filter === "Running" && status === "running") ||
        (filter === "Blocked" && status === "blocked") ||
        (filter === "Completed" &&
          pr.status === "ready_for_maintainer_review") ||
        (filter === "Latest scan" &&
          snapshot.latestScan?.prs.includes(pr.number))
      );
    })
    .sort((a, b) => rank[overall(a)] - rank[overall(b)] || b.number - a.number);
}

// PR-controlled strings must never emit terminal control sequences or bidi overrides.
export function clean(text: string): string {
  return text
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, "");
}
export const cleanMultiline = (value: string) =>
  value.split(/\r?\n/).map(clean).join("\n");
export function previewAction(
  pr: PullRequest,
): { title: string; detail: string } | undefined {
  const gate = currentGate(pr);
  const next = assessment(pr).next;
  if (next.action === "approve")
    return {
      title: `Approve ${gate} for #${pr.number}?`,
      detail:
        gate === "verification"
          ? "Would mark this PR ready for maintainer review. Nothing would be published."
          : `Would approve this revision for ${gate === "classification" ? "code review" : "verification"}. The harness can then launch the approved stage.`,
    };
  if (next.action === "decide")
    return {
      title: `Maintainer decision for #${pr.number}`,
      detail:
        "This stage cannot advance. An override would require your reasoning, preserve the original finding, and still require explicit approval.",
    };
  if (next.action === "launch")
    return {
      title: `Start ${gate} for #${pr.number}?`,
      detail:
        "The preceding gate is approved. Would request this stage through the configured runtime, subject to revision and capacity checks.",
    };
  return undefined;
}

export function latestIssueRun(
  snapshot: Snapshot,
  number: number,
): IssueRun | undefined {
  return snapshot.issueRuns
    ?.filter((run) => run.number === number)
    .sort((a, b) => b.updated.localeCompare(a.updated))[0];
}
