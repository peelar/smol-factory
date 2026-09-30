import { Effect } from "effect";
import { BunServices } from "@effect/platform-bun";
import { Factory, isExternalContributor } from "../src/factory";
import { ProcessRunner, processRunner } from "../src/io";
import { storageRoot } from "../src/paths";
import { createFileSource } from "./files";
import { Schema } from "effect";
import type { Snapshot } from "./model";
import type { PrPreview } from "./model";
import { fileSchema } from "../src/schema";

export interface LivePrDetails {
  title: string;
  author: string;
  head: string;
  url: string;
  eligible: boolean;
}

const refreshAfter = 5 * 60_000;
const retryAfter = 60_000;
const browsePageSize = 20;
export function createPrPreviewSource(
  root: string,
  fetchPreview: (number: number) => Promise<PrPreview> = async (number) => {
    const factory = new Factory(root);
    return Effect.runPromise(
      Effect.gen(function* () {
        const { config } = yield* factory.package();
        const pr = yield* factory.metadata(number);
        const files = yield* factory.pages(
          `repos/${config.repository}/pulls/${number}/files`,
          fileSchema,
        );
        return {
          number,
          head: pr.head.sha,
          body: pr.body ?? "",
          files: files.map((file) => ({
            path: file.filename,
            status: file.status,
            patch: file.patch ?? null,
          })),
        };
      }).pipe(
        Effect.provideService(ProcessRunner, processRunner),
        Effect.provide(BunServices.layer),
      ),
    );
  },
) {
  const cache = new Map<number, { value: PrPreview; time: number }>();
  const pending = new Map<number, Promise<PrPreview>>();
  return (number: number, force = false) => {
    const cached = cache.get(number);
    if (!force && cached && Date.now() - cached.time < refreshAfter)
      return Promise.resolve(cached.value);
    const inFlight = pending.get(number);
    if (inFlight) return inFlight;
    const request = fetchPreview(number)
      .then((value) => {
        cache.set(number, { value, time: Date.now() });
        return value;
      })
      .finally(() => pending.delete(number));
    pending.set(number, request);
    return request;
  };
}
const searchItemSchema = Schema.Struct({
  number: Schema.Number,
  title: Schema.String,
  html_url: Schema.String,
  author_association: Schema.optional(Schema.String),
  draft: Schema.optional(Schema.Boolean),
  user: Schema.NullOr(
    Schema.Struct({ login: Schema.String, type: Schema.String }),
  ),
});
type SearchItem = typeof searchItemSchema.Type;

export function externalBrowsePage(
  kind: "issue" | "pr",
  page: number,
  items: readonly SearchItem[],
  coreMembers: readonly string[],
): NonNullable<Snapshot["browse"]> {
  const eligible = items.filter(
    (item) =>
      isExternalContributor(item, coreMembers) &&
      (kind !== "pr" || item.draft !== true),
  );
  return {
    kind,
    page,
    total: eligible.length,
    items: eligible
      .slice((page - 1) * browsePageSize, page * browsePageSize)
      .map((item) => ({
        number: item.number,
        title: item.title,
        author: item.user!.login,
        url: item.html_url,
      })),
  };
}

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
  fetchPage: (
    kind: "issue" | "pr",
    page: number,
  ) => Promise<NonNullable<Snapshot["browse"]>> = async (kind, page) => {
    const factory = new Factory(root);
    const { config } = await Effect.runPromise(
      factory.package().pipe(Effect.provide(BunServices.layer)),
    );
    const query = `repo:${config.repository} is:${kind === "issue" ? "issue" : "pr"} is:open`;
    const items: SearchItem[] = [];
    for (let searchPage = 1; searchPage <= 10; searchPage++) {
      const response = await Effect.runPromise(
        factory
          .api(
            `search/issues?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=100&page=${searchPage}`,
          )
          .pipe(
            Effect.flatMap(
              Schema.decodeUnknownEffect(
                Schema.Struct({
                  total_count: Schema.Number,
                  items: Schema.Array(searchItemSchema),
                }),
              ),
            ),
            Effect.provideService(ProcessRunner, processRunner),
            Effect.provide(BunServices.layer),
          ),
      );
      items.push(...response.items);
      if (items.length >= Math.min(response.total_count, 1000)) break;
    }
    return externalBrowsePage(kind, page, items, config.core_members);
  },
) {
  const readFiles = createFileSource(storageRoot(root));
  const details = new Map<number, LivePrDetails>();
  const attempted = new Map<number, number>();
  const failed = new Set<number>();
  let refreshing = false;
  const pages = new Map<
    string,
    { value: NonNullable<Snapshot["browse"]>; time: number }
  >();

  return async (force = false, kind: "issue" | "pr" = "pr", page = 1) => {
    const snapshot = await readFiles();
    const pageKey = `${kind}:${page}`;
    const cached = pages.get(pageKey);
    if (force || !cached || Date.now() - cached.time >= refreshAfter) {
      try {
        const value = await fetchPage(kind, page);
        pages.set(pageKey, { value, time: Date.now() });
        snapshot.browse = value;
      } catch {
        snapshot.browse = cached?.value ?? { kind, page, total: 0, items: [] };
        snapshot.warnings.push(
          "Could not load the GitHub page; showing saved data if available.",
        );
      }
    } else snapshot.browse = cached.value;
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
      return [
        {
          ...pr,
          title: live.title,
          author: live.author || pr.author,
          url: live.url,
        },
      ];
    });
    if (failed.size)
      snapshot.warnings.push(
        "Could not refresh some PR details from GitHub; showing saved details.",
      );
    return snapshot;
  };
}
