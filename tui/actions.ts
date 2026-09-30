import { Effect } from "effect";
import { Factory } from "../src/factory";
import { fail, withLock } from "../src/io";
import type { Gate } from "../src/schema";
import { Workflow } from "../src/workflow";
export type QueueAction =
  | { kind: "scan" }
  | { kind: "collect-issue"; number: number }
  | { kind: "classify-target"; number: number; head: string }
  | { kind: "classify"; run: string }
  | {
      kind: "approve" | "launch";
      number: number;
      gate: Gate;
      fingerprint: string;
    };

/** Both UI and CLI use the same engine; a displayed revision is a precondition. */
export const performAction = (factory: Factory, action: QueueAction) =>
  withLock(
    factory.storage,
    Effect.gen(function* () {
      if (action.kind === "scan") {
        yield* factory.scan();
        return "Scan saved. Classification is a separate action.";
      }
      if (action.kind === "collect-issue") {
        yield* new Workflow(factory).scanTarget({
          kind: "issue",
          number: action.number,
        });
        return `Issue #${action.number} collected. Ask your agent to assess it and prepare exact proposals.`;
      }
      if (action.kind === "classify-target") {
        const current = yield* factory.metadata(action.number);
        if (current.head.sha !== action.head)
          return yield* fail(
            "PR changed since the preview. Refresh and review the current revision before classifying.",
          );
        const scan = yield* factory.scan(
          undefined,
          [action.number],
          action.head,
        );
        if (!scan.prs.includes(action.number))
          return yield* fail(
            `PR #${action.number} is not eligible for assessment`,
          );
        const captured = yield* factory.state(action.number);
        if (captured.head !== action.head)
          return yield* fail(
            "PR changed during evidence capture. Refresh and review before classifying.",
          );
        if (!scan.pending?.includes(action.number))
          return `PR #${action.number} already has a current classification.`;
        yield* factory.classify(scan.id);
        return `PR #${action.number} classified. Findings require maintainer review.`;
      }
      if (action.kind === "classify") {
        yield* factory.classify(action.run);
        return "Classification recorded. Findings still require maintainer approval.";
      }
      const state = yield* factory.state(action.number);
      if (state.fingerprint !== action.fingerprint)
        return yield* fail(
          "The displayed assessment changed. Refresh and review before confirming again.",
        );
      if (action.kind === "approve") {
        yield* factory.approve(
          action.number,
          action.gate,
          `Maintainer confirmed approval of ${action.gate} for PR #${action.number}, fingerprint ${action.fingerprint}, in the smol terminal UI.`,
        );
        return "Approval recorded. No next stage was launched.";
      }
      yield* factory.launch(action.number, action.gate);
      return "Approved stage launched. No subsequent gate will start automatically.";
    }),
  );
