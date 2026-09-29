import { Effect, FileSystem, Schema } from "effect";
import { BunServices } from "@effect/platform-bun";
import { join } from "node:path";
import { readSchema } from "../src/io";
import { manifestSchema } from "../src/schema";
import { gates, prSchema, type PullRequest, type Snapshot } from "./model";

const configSchema = Schema.Struct({
  models: Schema.Record(Schema.String, Schema.Struct({ model: Schema.String })),
});
const entries = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs
      .readDirectory(path)
      .pipe(
        Effect.catch((error) =>
          error.reason._tag === "NotFound"
            ? Effect.succeed([] as string[])
            : Effect.fail(error),
        ),
      );
  });

/** Read-only Effect projection; the cache belongs to one terminal session. */
export function createSnapshotSource(root: string) {
  const previous = new Map<number, PullRequest>();
  return () =>
    Effect.gen(function* () {
      const snapshot: Snapshot = { prs: [], warnings: [], models: {} };
      const numbers = (yield* entries(join(root, ".runtime/prs"))).filter(
        (name) => /^\d+$/.test(name),
      );
      for (const number of numbers) {
        yield* readSchema(
          join(root, ".runtime/prs", number, "state.json"),
          prSchema,
        ).pipe(
          Effect.filterOrFail(
            (pr) => pr.number === Number(number),
            () => new Error("PR number mismatch"),
          ),
          Effect.tap((pr) =>
            Effect.sync(() => {
              previous.set(pr.number, pr);
              snapshot.prs.push(pr);
            }),
          ),
          Effect.catch(() =>
            Effect.sync(() => {
              snapshot.warnings.push(
                `#${number}: unreadable state; showing last good snapshot if available.`,
              );
              const cached = previous.get(Number(number));
              if (cached) snapshot.prs.push(cached);
            }),
          ),
        );
      }
      for (const scan of (yield* entries(join(root, ".runtime/scans")))
        .sort()
        .reverse()) {
        const manifest = yield* readSchema(
          join(root, ".runtime/scans", scan, "manifest.json"),
          manifestSchema,
        ).pipe(Effect.catch(() => Effect.succeed(undefined)));
        if (manifest) {
          snapshot.latestScan = manifest;
          break;
        }
        snapshot.warnings.push(
          `Scan ${scan}: incomplete (manifest unavailable).`,
        );
      }
      yield* readSchema(join(root, "local/config.json"), configSchema).pipe(
        Effect.tap((config) =>
          Effect.sync(() => {
            for (const gate of gates)
              snapshot.models[gate] = config.models[gate]?.model;
          }),
        ),
        Effect.catch(() =>
          Effect.sync(() => {
            snapshot.warnings.push("Personal model settings unavailable.");
          }),
        ),
      );
      return snapshot;
    });
}

/** Promise boundary for React. All reads and recovery above remain Effects. */
export function createFileSource(root: string) {
  const load = createSnapshotSource(root);
  return () =>
    Effect.runPromise(load().pipe(Effect.provide(BunServices.layer)));
}
