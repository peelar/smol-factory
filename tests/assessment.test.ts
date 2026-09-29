import { expect, test } from "bun:test";
import { assessment, assessmentStatus } from "../src/assessment";
import { stageReport, currentStageMarkdown } from "../src/report";
import { demoSnapshot } from "../tui/demo";
import { selectPrs } from "../tui/model";

const example = () => structuredClone(demoSnapshot().prs[0]!);

test("status, human queue and reports agree on pending decisions", () => {
  const snapshot = demoSnapshot();
  const status = assessmentStatus(snapshot.prs);
  expect(status.counts).toEqual({
    total: 6,
    needs_maintainer: 3,
    running: 2,
    completed: 1,
  });
  expect(
    status.assessments
      .filter((pr) => pr.needs_maintainer)
      .map((pr) => pr.number)
      .sort(),
  ).toEqual(
    selectPrs(snapshot, "Needs me")
      .map((pr) => pr.number)
      .sort(),
  );
  for (const pr of snapshot.prs) {
    const view = assessment(pr);
    expect(stageReport(pr, view.gate).next).toBe(view.next.reason);
    expect(currentStageMarkdown(pr)[0]).toBe(`Next: ${view.next.reason}`);
  }
});

test("full evidence and fingerprint travel with an approval request", () => {
  const pr = example();
  pr.results.review!.evidence = ["one", "two", "three"];
  const view = assessment(pr);
  expect(view.next).toMatchObject({
    actor: "maintainer",
    action: "approve",
    gate: "review",
  });
  expect(view.fingerprint).toBe(pr.fingerprint);
  expect(view.focus?.result.evidence).toHaveLength(3);
  expect(view.stages[1]?.result?.evidence).toHaveLength(3);
  expect(view.stages[1]?.approval).toBeNull();
});

test("approval hands work to the harness without claiming it ran", () => {
  const pr = example();
  pr.approvals.review = {
    fingerprint: pr.fingerprint,
    statement: "Verify",
    time: "now",
  };
  pr.status = "review:approved";
  const view = assessment(pr);
  expect(view.next).toMatchObject({
    actor: "harness",
    action: "launch",
    gate: "verification",
  });
  expect(view.needs_maintainer).toBe(false);
  expect(view.focus?.gate).toBe("review");
  expect(view.stages[2]?.result).toBeNull();
});

test("stale approvals and results request a rescan, never approval or launch", () => {
  const pr = example();
  pr.fingerprint = "new-revision";
  const view = assessment(pr);
  expect(view.next.action).toBe("rescan");
  expect(view.needs_maintainer).toBe(false);
  expect(view.focus?.status).toBe("stale");
});

test("running and interrupted work require inspection, not another launch", () => {
  const pr = example();
  delete pr.results.review;
  pr.status = "running:review";
  expect(assessment(pr).next.action).toBe("wait");
  pr.status = "review:interrupted";
  expect(assessment(pr).next.action).toBe("inspect");
  expect(stageReport(pr, "review").outcome).toBe("Interrupted / failed");
});

test("passing evidence alone does not make an inconsistent state approvable", () => {
  const pr = example();
  pr.status = "awaiting_classification";
  expect(assessment(pr).next.action).toBe("inspect");
});
