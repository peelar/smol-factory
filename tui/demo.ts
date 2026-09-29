import { gates, type PullRequest, type Snapshot } from "./model";

export function demoSnapshot(): Snapshot {
  const examples = [
    [
      901,
      "Hide shipping warnings for digital-only drafts",
      "review:awaiting_approval",
    ],
    [902, "Preserve filters when returning to product list", "running:review"],
    [
      903,
      "Add delivery indicators to order details",
      "classification:needs_decision",
    ],
    [904, "Correct tax section redirects", "review:needs_changes"],
    [
      905,
      "Improve keyboard navigation in variant grid",
      "running:verification",
    ],
    [
      906,
      "Fix overlapping environment variable replacement",
      "ready_for_maintainer_review",
    ],
  ] as const;
  const prs = examples.map(([number, title, status]): PullRequest => {
    const pr: PullRequest = {
      number,
      title,
      author: `contributor${number}`,
      status,
      head: "demo123456789",
      fingerprint: "demo",
      results: {},
      approvals: {},
      history: [],
    };
    const completed = status.startsWith("classification")
      ? 0
      : status.startsWith("review") || status === "running:review"
        ? 1
        : 2;
    for (const [index, gate] of gates.entries()) {
      if (index <= completed && status !== `running:${gate}`) {
        pr.results[gate] = {
          fingerprint: "demo",
          verdict:
            status.endsWith("needs_changes") && index === completed
              ? "needs_changes"
              : status.endsWith("needs_decision")
                ? "needs_decision"
                : "pass",
          summary:
            index === completed
              ? "The change is focused and consistent with existing behavior. Waiting for your decision before progressing."
              : "Assessment complete; maintainer approved this stage.",
          findings:
            status.endsWith("needs_changes") && index === completed
              ? [
                  "Redirect drops the active channel query parameter. Preserve it before advancing.",
                ]
              : [],
          evidence: ["Demo evidence only — no real PR or agent execution."],
        };
        if (index < completed || status === "ready_for_maintainer_review")
          pr.approvals[gate] = {
            fingerprint: "demo",
            statement: "Example approval",
            time: "2026-09-28T14:00:00Z",
          };
      }
    }
    pr.history = [
      {
        time: "2026-09-28T13:00:00Z",
        event: "Discovered",
        text: "Illustrative PR added to demo scan.",
      },
      {
        time: "2026-09-28T14:00:00Z",
        event: status,
        text: "Sample workflow activity. This is not live factory data.",
      },
    ];
    return pr;
  });
  return {
    prs,
    warnings: [],
    models: {
      classification: "gpt-6-luna",
      review: "gpt-6-sol",
      verification: "gpt-6-sol",
    },
    latestScan: {
      id: "demo",
      created: "2026-09-28T13:00:00Z",
      prs: prs.map((pr) => pr.number),
    },
  };
}
