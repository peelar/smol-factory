import { Effect } from "effect";
import { BunServices } from "@effect/platform-bun";
import { Factory } from "../src/factory";
import { ProcessRunner, processRunner } from "../src/io";
import { storageRoot } from "../src/paths";
import { createFileSource } from "./files";

export interface LivePrDetails {
  title: string;
  author: string;
  head: string;
  url: string;
  eligible: boolean;
}

const refreshAfter = 5 * 60_000;
const retryAfter = 60_000;

/** Keep assessment state local; overlay current GitHub details by PR number. */
export function createLiveSource(
  root: string,
  fetchDetails: (number: number) => Promise<LivePrDetails> = (number) => {
    const factory = new Factory(root);
    return Effect.runPromise(
      factory.metadata(number).pipe(
        Effect.flatMap((pr) =>
          factory.eligible(pr).pipe(
            Effect.map((eligible) => ({
              title: pr.title,
              author: pr.user?.login ?? "",
              head: pr.head.sha,
              url: pr.html_url,
              eligible,
            })),
          ),
        ),
        Effect.provideService(ProcessRunner, processRunner),
        Effect.provide(BunServices.layer),
      ),
    );
  },
) {
  const readFiles = createFileSource(storageRoot(root));
  const details = new Map<number, LivePrDetails>();
  const attempted = new Map<number, number>();
  const failed = new Set<number>();
  let refreshing = false;

  return async (force = false) => {
    const snapshot = await readFiles();
    const numbers = snapshot.prs
      .map((pr) => pr.number)
      .filter(
        (number) =>
          force ||
          Date.now() - (attempted.get(number) ?? 0) >=
            (failed.has(number) ? retryAfter : refreshAfter),
      );
    if (numbers.length && !refreshing) {
      refreshing = true;
      // Do not delay local updates while GitHub responds. Limit request fanout.
      void (async () => {
        let next = 0;
        await Promise.all(
          Array.from({ length: Math.min(4, numbers.length) }, async () => {
            while (next < numbers.length) {
              const number = numbers[next++]!;
              attempted.set(number, Date.now());
              try {
                details.set(number, await fetchDetails(number));
                failed.delete(number);
              } catch {
                failed.add(number);
              }
            }
          }),
        );
        refreshing = false;
      })();
    }
    snapshot.prs = snapshot.prs.flatMap((pr) => {
      const live = details.get(pr.number);
      if (!live) return [pr];
      if (!live.eligible) return [];
      if (live.head !== pr.head || live.title !== pr.title)
        snapshot.warnings.unshift(
          `#${pr.number}: GitHub details differ from saved assessment; scan before acting.`,
        );
      return [{
        ...pr,
        title: live.title,
        author: live.author || pr.author,
        url: live.url,
      }];
    });
    if (failed.size)
      snapshot.warnings.push(
        "Could not refresh some PR details from GitHub; showing saved details.",
      );
    return snapshot;
  };
}
