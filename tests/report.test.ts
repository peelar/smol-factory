import { expect, test } from "bun:test";
import { stageReport } from "../src/report";
import type { PullRequest } from "../src/schema";

function pr(): PullRequest {
  return {
    number: 1,
    title: "Example",
    head: "head",
    fingerprint: "current",
    status: "classification:awaiting_approval",
    approvals: {},
    history: [],
    results: {
      classification: {
        fingerprint: "current",
        verdict: "pass",
        summary: "Fits. Limits: no tests run.",
        findings: [],
        evidence: ["one", "two", "three"],
      },
    },
  };
}

test("passing result requires approval and retains detail outside the evidence preview", () => {
  const value = pr();
  expect(stageReport(value, "classification").outcome).toBe("Needs approval");
  expect(stageReport(value, "review").next).toBe(
    "Await explicit approval of classification.",
  );
  expect(stageReport(value, "classification").evidence).toEqual(["one", "two"]);
  expect(value.results.classification!.evidence).toHaveLength(3);
  value.approvals.classification = {
    fingerprint: "current",
    statement: "Review",
    time: "now",
  };
  expect(stageReport(value, "review").next).toBe(
    "Launch the approved review stage.",
  );
});

test("stale approval cannot authorize the next stage", () => {
  const value = pr();
  value.approvals.classification = {
    fingerprint: "old",
    statement: "Review",
    time: "then",
  };
  expect(stageReport(value, "classification").outcome).toBe("Stale");
  expect(stageReport(value, "review").next).toBe(
    "Await explicit approval of classification.",
  );
});
