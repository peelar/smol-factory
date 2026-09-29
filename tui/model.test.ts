import { expect, test } from "bun:test";
import { demoSnapshot } from "./demo";
import {
  clean,
  currentGate,
  overall,
  previewAction,
  selectPrs,
  stageStatus,
} from "./model";

test("pass is not approval, and approval advances the displayed stage", () => {
  const pr = demoSnapshot().prs[0]!;
  expect(stageStatus(pr, "classification")).toBe("approved");
  expect(stageStatus(pr, "review")).toBe("passed");
  expect(currentGate(pr)).toBe("review");
  expect(previewAction(pr)?.title).toContain("Approve review");
});
test("stale results and stale approvals never appear approved", () => {
  const pr = demoSnapshot().prs[0]!;
  pr.fingerprint = "new";
  expect(overall(pr)).toBe("stale");
  expect(previewAction(pr)).toBeUndefined();
});
test("attention-first sorting and all filters", () => {
  const snapshot = demoSnapshot();
  expect(selectPrs(snapshot, "All PRs")[0]?.number).toBe(901);
  expect(selectPrs(snapshot, "Needs me").map((pr) => pr.number)).toEqual([
    901, 903, 904,
  ]);
  expect(selectPrs(snapshot, "Running")).toHaveLength(2);
  expect(selectPrs(snapshot, "Blocked")[0]?.number).toBe(904);
  expect(selectPrs(snapshot, "Completed")[0]?.number).toBe(906);
  expect(selectPrs(snapshot, "Latest scan")).toHaveLength(6);
});
test("blocked action asks for a reason, not ordinary approval", () => {
  const pr = demoSnapshot().prs.find((pr) => pr.number === 904)!;
  expect(previewAction(pr)?.title).toContain("Maintainer decision");
  expect(previewAction(pr)?.detail).toContain("reasoning");
});
test("running and failure are not findings", () => {
  const pr = demoSnapshot().prs[1]!;
  expect(overall(pr)).toBe("running");
  expect(previewAction(pr)).toBeUndefined();
  pr.status = "review:failed";
  expect(overall(pr)).toBe("failed");
});
test("terminal control and directional overrides are stripped", () => {
  expect(clean("\x1b[31mhello\x1b[0m\u202e\x07")).toBe("hello");
  expect(clean("\x1b]52;c;secret\x07safe")).toBe("safe");
});
