import { Effect } from "effect";
import { Factory } from "../src/factory";
import { fail, withLock } from "../src/io";
import type { Gate } from "../src/schema";
export type QueueAction =
  | { kind: "scan" }
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
