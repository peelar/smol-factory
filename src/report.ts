import { assessment, stageStatus } from "./assessment";
import { gates, type Gate, type PullRequest } from "./schema";

export const resultGuidance = `Write a compact decision summary, aiming for 80–150 words across summary and decisive evidence, with exceptions for complex changes.
Start summary with the conclusion and one-sentence reason; end with an explicit Limits: sentence describing unperformed checks or missing evidence. Distinguish reported claims, source inference, and observed behavior. Never imply tests ran during classification or review.
Put the most decisive evidence first. Keep all actionable findings with location, impact, and supporting evidence in findings; do not omit blockers to meet the word target. Keep full artifact references in evidence. The factory supplies approval status and next actions; do not claim authorization in the summary.`;

export function stageReport(pr: PullRequest, gate: Gate) {
  const result = pr.results[gate];
  const approval = pr.approvals[gate];
  const status = stageStatus(pr, gate);
  const stale = status === "stale";
  const running = status === "running";
  const previous = gates[gates.indexOf(gate) - 1];
  const authorized =
    previous && pr.approvals[previous]?.fingerprint === pr.fingerprint;
  const outcomes = {
    stale: "Stale",
    running: "Running",
    approved: "Approved",
    passed: "Needs approval",
    blocked: "Needs changes",
    decision: "Needs decision",
    waiting: "Not started",
    queued: "Queued",
    failed: "Interrupted / failed",
  };
  const outcome = outcomes[status];
  const view = assessment(pr);
  const next =
    gate === view.gate
      ? view.next.reason
      : stale
        ? "Scan again before making a decision; this assessment is stale."
        : running
          ? "Wait for the stage result; inspect its thread for live activity."
          : approval
            ? gate === "verification"
              ? "Ready for maintainer review. Nothing is merged or published."
              : `Approval recorded. Inspect the ${gates[gates.indexOf(gate) + 1]} stage for its next action.`
            : result?.verdict === "pass"
              ? `Maintainer approval of ${gate} is pending. No next stage starts automatically.`
              : result
                ? "Maintainer decision on the findings is pending; this stage cannot advance."
                : gate === "classification"
                  ? "Classify the captured scan."
                  : authorized
                    ? `Launch the approved ${gate} stage.`
                    : `Await explicit approval of ${previous}.`;
  return {
    outcome,
    summary: result?.summary ?? "No result recorded for this stage yet.",
    evidence: result?.evidence.slice(0, 2) ?? [],
    findingCount: result?.findings.length ?? 0,
    next,
  };
}

export function currentStageMarkdown(pr: PullRequest): string[] {
  const view = assessment(pr);
  return [
    `Next: ${view.next.reason}`,
    "",
    ...(view.focus ? [view.focus.result.summary, ""] : []),
    ...gates.flatMap((gate) => {
      const report = stageReport(pr, gate);
      return [
        `### ${gate} · ${report.outcome}`,
        "",
        report.summary,
        "",
        ...report.evidence.map((item) => `- Evidence: ${item}`),
        ...(report.findingCount
          ? [`\n${report.findingCount} finding(s). See full findings below.`]
          : []),
        "",
        `Next: ${report.next}`,
        "",
      ];
    }),
  ];
}
