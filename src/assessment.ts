import { gates, type Gate, type PullRequest } from "./schema";

export type StageStatus =
  | "waiting"
  | "running"
  | "passed"
  | "approved"
  | "blocked"
  | "decision"
  | "stale"
  | "queued"
  | "failed";
export function stageStatus(pr: PullRequest, gate: Gate): StageStatus {
  const result = pr.results[gate];
  const approval = pr.approvals[gate];
  if (
    (result && result.fingerprint !== pr.fingerprint) ||
    (approval && approval.fingerprint !== pr.fingerprint)
  )
    return "stale";
  if (pr.status === `running:${gate}`) return "running";
  if (pr.status === `queued:${gate}`) return "queued";
  if ([`${gate}:stale`, `stale:${gate}`].includes(pr.status)) return "stale";
  if ([`${gate}:failed`, `${gate}:interrupted`].includes(pr.status))
    return "failed";
  if (approval) return "approved";
  if (result?.verdict === "pass") return "passed";
  if (result?.verdict === "needs_changes") return "blocked";
  if (result?.verdict === "needs_decision") return "decision";
  return "waiting";
}
export function currentGate(pr: PullRequest): Gate {
  return (
    gates.find((gate) => stageStatus(pr, gate) !== "approved") ?? "verification"
  );
}
export function overall(pr: PullRequest): StageStatus {
  return stageStatus(pr, currentGate(pr));
}

export interface NextStep {
  actor: "maintainer" | "harness" | "none";
  action:
    | "approve"
    | "decide"
    | "launch"
    | "classify_scan"
    | "rescan"
    | "inspect"
    | "wait"
    | "complete";
  gate: Gate;
  reason: string;
}

/** Local projection only. Mutations still check upstream revision and runtime readiness. */
export function nextStep(pr: PullRequest): NextStep {
  const gate = currentGate(pr);
  const status = stageStatus(pr, gate);
  const step = (
    actor: NextStep["actor"],
    action: NextStep["action"],
    reason: string,
  ): NextStep => ({ actor, action, gate, reason });
  if (status === "stale")
    return step(
      "harness",
      "rescan",
      "Scan again before making a decision; this assessment is stale.",
    );
  if (status === "running")
    return step(
      "harness",
      "wait",
      "Wait for the stage result; inspect its thread for live activity.",
    );
  if (status === "failed")
    return step(
      "harness",
      "inspect",
      "Inspect the existing thread and execution evidence before retrying.",
    );
  if (status === "approved")
    return step(
      "none",
      "complete",
      "Ready for maintainer review. Nothing is merged or published.",
    );
  if (status === "passed" && pr.status === `${gate}:awaiting_approval`)
    return step(
      "maintainer",
      "approve",
      `Maintainer approval of ${gate} is pending. No next stage starts automatically.`,
    );
  if (status === "blocked" || status === "decision")
    return step(
      "maintainer",
      "decide",
      "Maintainer decision on the findings is pending; this stage cannot advance.",
    );
  if (pr.results[gate])
    return step(
      "harness",
      "inspect",
      "Result and workflow state disagree. Inspect the recorded assessment before continuing.",
    );
  if (gate === "classification")
    return step("harness", "classify_scan", "Classify the captured scan.");
  const previous = gates[gates.indexOf(gate) - 1]!;
  if (
    pr.approvals[previous]?.fingerprint === pr.fingerprint &&
    !pr.status.startsWith("running:")
  )
    return step("harness", "launch", `Launch the approved ${gate} stage.`);
  return step("harness", "inspect", `Await explicit approval of ${previous}.`);
}

export function assessment(pr: PullRequest) {
  const gate = currentGate(pr);
  const next = nextStep(pr);
  const stages = gates.map((stage) => ({
    gate: stage,
    status: stageStatus(pr, stage),
    result: pr.results[stage] ?? null,
    approval: pr.approvals[stage] ?? null,
  }));
  const focus =
    stages.find((stage) => stage.gate === gate && stage.result) ??
    stages.findLast((stage) => stage.result);
  return {
    number: pr.number,
    title: pr.title,
    url: pr.url ?? null,
    head: pr.head,
    fingerprint: pr.fingerprint,
    status: pr.status,
    gate,
    stage_status: stageStatus(pr, gate),
    needs_maintainer: next.actor === "maintainer",
    next,
    focus: focus
      ? { gate: focus.gate, status: focus.status, result: focus.result! }
      : null,
    stages,
    thread: pr.thread ?? null,
    packet: pr.packet ?? null,
  };
}

export function assessmentStatus(prs: PullRequest[]) {
  const assessments = prs.map(assessment);
  return {
    version: 1,
    freshness: "local_snapshot",
    transition_checks: [
      "upstream_revision",
      "workflow_state",
      "runtime_readiness",
    ],
    counts: {
      total: assessments.length,
      needs_maintainer: assessments.filter((pr) => pr.needs_maintainer).length,
      running: assessments.filter((pr) => pr.stage_status === "running").length,
      completed: assessments.filter((pr) => pr.next.action === "complete")
        .length,
    },
    assessments,
  };
}
