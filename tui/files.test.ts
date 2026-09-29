import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createFileSource } from "./files";
import { demoSnapshot } from "./demo";

test("file projection survives partial writes, sees updates, and is read-only", async () => {
  const parent = resolve(import.meta.dir, "../.runtime/tui-tests");
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, "files-"));
  const dir = join(root, ".runtime/prs/901");
  await mkdir(dir, { recursive: true });
  const pr = demoSnapshot().prs[0]!;
  pr.thread = null;
  const path = join(dir, "state.json");
  const original = JSON.stringify(pr);
  await writeFile(path, original);
  const load = createFileSource(root);
  expect((await load()).prs[0]?.number).toBe(901);
  expect(await readFile(path, "utf8")).toBe(original);
  await writeFile(path, "{");
  const incomplete = await load();
  expect(incomplete.prs[0]?.number).toBe(901);
  expect(incomplete.warnings[0]).toContain("unreadable state");
  pr.title = "Updated title";
  await writeFile(path, JSON.stringify(pr));
  expect((await load()).prs[0]?.title).toBe("Updated title");
  expect((await createFileSource(root)()).prs[0]?.title).toBe("Updated title");
});
test("invalid files warn rather than crashing or fabricating PRs", async () => {
  const parent = resolve(import.meta.dir, "../.runtime/tui-tests");
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, "invalid-"));
  await mkdir(join(root, ".runtime/prs/1"), { recursive: true });
  await writeFile(
    join(root, ".runtime/prs/1/state.json"),
    JSON.stringify({ number: 1 }),
  );
  const snapshot = await createFileSource(root)();
  expect(snapshot.prs).toEqual([]);
  expect(snapshot.warnings[0]).toContain("#1");
});
