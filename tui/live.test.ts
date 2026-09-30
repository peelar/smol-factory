import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { demoSnapshot } from "./demo";
import {
  createLiveSource,
  createPrPreviewSource,
  externalBrowsePage,
} from "./live";

test("selected PR content loads on demand and is cached", async () => {
  const calls: number[] = [];
  const load = createPrPreviewSource("unused", async (number) => {
    calls.push(number);
    return {
      number,
      head: `head-${number}`,
      body: `Body ${number}`,
      files: [{ path: "change.ts", status: "modified", patch: "+change" }],
    };
  });
  expect((await load(4)).body).toBe("Body 4");
  await load(4);
  await load(5);
  await load(4, true);
  expect(calls).toEqual([4, 5, 4]);
});

test("Issues and PR pages exclude core members and keep external pagination dense", () => {
  const items = Array.from({ length: 24 }, (_, index) => ({
    number: index + 1,
    title: `Item ${index + 1}`,
    html_url: `https://example.test/items/${index + 1}`,
    author_association: index === 0 ? "MEMBER" : "NONE",
    user: {
      login: index === 1 ? "CorePerson" : `outside-${index}`,
      type: index === 2 ? "Bot" : "User",
    },
  }));
  const first = externalBrowsePage("issue", 1, items, ["coreperson"]);
  const second = externalBrowsePage("issue", 2, items, ["coreperson"]);
  expect(first.total).toBe(21);
  expect(first.items.map((item) => item.number)).toEqual(
    Array.from({ length: 20 }, (_, index) => index + 4),
  );
  expect(second.items.map((item) => item.number)).toEqual([24]);
  expect(
    externalBrowsePage(
      "pr",
      1,
      [
        ...items,
        {
          ...items[3]!,
          number: 25,
          draft: true,
        },
      ],
      ["coreperson"],
    ).total,
  ).toBe(21);
});

test("browser fetches a page once, changes pages, and refreshes on demand", async () => {
  const parent = resolve(import.meta.dir, "../.runtime/tui-tests");
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, "pages-"));
  const calls: string[] = [];
  const load = createLiveSource(
    root,
    async () => {
      throw new Error("No saved PRs need metadata");
    },
    async (kind, page) => {
      calls.push(`${kind}:${page}`);
      return {
        kind,
        page,
        total: 41,
        items: [
          {
            number: page,
            title: `${kind} ${page}`,
            author: "author",
            url: "https://example.test/item",
          },
        ],
      };
    },
  );
  expect((await load()).browse?.items[0]?.title).toBe("pr 1");
  await load();
  expect((await load(false, "issue", 2)).browse?.items[0]?.title).toBe(
    "issue 2",
  );
  await load(true, "issue", 2);
  expect(calls).toEqual(["pr:1", "issue:2", "issue:2"]);
});

test("live PR details join saved assessment by number without changing state", async () => {
  const parent = resolve(import.meta.dir, "../.runtime/tui-tests");
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, "live-"));
  const path = join(root, ".smol-factory/.runtime/prs/901/state.json");
  await mkdir(resolve(path, ".."), { recursive: true });
  const pr = demoSnapshot().prs[0]!;
  delete pr.author;
  const original = JSON.stringify(pr);
  await writeFile(path, original);
  let calls = 0;
  const load = createLiveSource(root, async (number) => {
    expect(number).toBe(901);
    calls++;
    return {
      title: "Current GitHub title",
      author: "current-author",
      head: pr.head,
      url: "https://example.test/pr/901",
      eligible: true,
    };
  });
  expect((await load()).prs[0]?.author).toBeUndefined();
  await Bun.sleep(10);
  const snapshot = await load();
  expect(snapshot.prs[0]).toMatchObject({
    number: 901,
    title: "Current GitHub title",
    author: "current-author",
    status: pr.status,
    results: pr.results,
  });
  expect(calls).toBe(1);
  expect(await readFile(path, "utf8")).toBe(original);
  await load(true);
  await Bun.sleep(10);
  expect(calls).toBe(2);
});

test("failed GitHub read leaves the saved assessment available", async () => {
  const parent = resolve(import.meta.dir, "../.runtime/tui-tests");
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, "live-failure-"));
  const path = join(root, ".smol-factory/.runtime/prs/901/state.json");
  await mkdir(resolve(path, ".."), { recursive: true });
  const pr = demoSnapshot().prs[0]!;
  await writeFile(path, JSON.stringify(pr));
  const load = createLiveSource(root, async () => {
    throw new Error("secret details");
  });
  await load();
  await Bun.sleep(10);
  const snapshot = await load();
  expect(snapshot.prs[0]?.title).toBe(pr.title);
  expect(snapshot.warnings).toContain(
    "Could not refresh some PR details from GitHub; showing saved details.",
  );
  expect(JSON.stringify(snapshot)).not.toContain("secret details");
});

test("changed GitHub details flag the saved assessment as needing a scan", async () => {
  const parent = resolve(import.meta.dir, "../.runtime/tui-tests");
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, "live-changed-"));
  const path = join(root, ".smol-factory/.runtime/prs/901/state.json");
  await mkdir(resolve(path, ".."), { recursive: true });
  const pr = demoSnapshot().prs[0]!;
  await writeFile(path, JSON.stringify(pr));
  const load = createLiveSource(root, async () => ({
    title: "Edited PR title",
    author: "new-author",
    head: pr.head,
    url: "https://example.test/pr/901",
    eligible: true,
  }));
  await load();
  await Bun.sleep(10);
  const snapshot = await load();
  expect(snapshot.warnings[0]).toContain("#901: GitHub details differ");
  expect(snapshot.prs[0]?.title).toBe("Edited PR title");
  expect(snapshot.prs[0]?.status).toBe(pr.status);
});

test("current ineligible PRs are omitted from the local assessment queue", async () => {
  const parent = resolve(import.meta.dir, "../.runtime/tui-tests");
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, "live-ineligible-"));
  const path = join(root, ".smol-factory/.runtime/prs/901/state.json");
  await mkdir(resolve(path, ".."), { recursive: true });
  const pr = demoSnapshot().prs[0]!;
  await writeFile(path, JSON.stringify(pr));
  const load = createLiveSource(root, async () => ({
    title: pr.title,
    author: "member",
    head: pr.head,
    url: "https://example.test/pr/901",
    eligible: false,
  }));
  await load();
  await Bun.sleep(10);
  expect((await load()).prs).toEqual([]);
  expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
    number: 901,
    status: pr.status,
  });
});
