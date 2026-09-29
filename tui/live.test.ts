import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { demoSnapshot } from "./demo";
import { createLiveSource } from "./live";

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
