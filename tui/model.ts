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
export interface Snapshot {
  prs: PullRequest[];
  warnings: string[];
  latestScan?: { id: string; created: string; prs: number[] };
  models: Partial<Record<Gate, string>>;
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
export function selectPrs(
  snapshot: Snapshot,
  filter: Filter,
): PullRequest[] {
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
        (filter === "All PRs" ||
          (filter === "Needs me" && assessment(pr).needs_maintainer) ||
          (filter === "Running" && status === "running") ||
          (filter === "Blocked" && status === "blocked") ||
          (filter === "Completed" &&
            pr.status === "ready_for_maintainer_review") ||
          (filter === "Latest scan" &&
            snapshot.latestScan?.prs.includes(pr.number)))
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
