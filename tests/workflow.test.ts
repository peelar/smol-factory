import { afterEach, beforeEach, expect, test } from "bun:test";
import { Effect, FileSystem } from "effect";
import { BunServices } from "@effect/platform-bun";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Factory } from "../src/factory";
import { IssueRuns } from "../src/issue-runs";
import { createFileSource } from "../tui/files";
import { latestIssueRun, browsePrimary } from "../tui/model";
import { Workflow } from "../src/workflow";
import { FactoryError, ProcessRunner, writeJson } from "../src/io";
import { gates } from "../src/schema";
import { command } from "../scripts/smol";

let root: string, factory: Factory, workflow: Workflow;
let issue: {
  number: number;
  title: string;
  body: string;
  state: string;
  state_reason: string | null;
  updated_at: string;
  html_url: string;
  labels: { name: string }[];
};
let comments: { id: number; body: string }[];
let writes: string[][];
let calls: string[][];
let failWrite: boolean;
let sourceRevision: string;
const run = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | ProcessRunner>,
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provideService(ProcessRunner, {
        run: (argv) =>
          Effect.tryPromise({
            try: async () => {
              calls.push([...argv]);
              if (argv[1] === "issue" && argv[2] === "list")
                return JSON.stringify([{ number: 1 }]);
              const endpoint = argv[4] ?? "";
              if (argv[3] === "GET") {
                if (endpoint.includes("/comments"))
                  return JSON.stringify(comments);
                if (endpoint.includes("/commits?"))
                  return JSON.stringify([{ sha: sourceRevision }]);
                return JSON.stringify(issue);
              }
              writes.push([...argv]);
              const file = argv[argv.indexOf("--input") + 1];
              const body = file ? JSON.parse(await readFile(file, "utf8")) : {};
              if (body.labels)
                issue.labels = body.labels.map((name: string) => ({ name }));
              if (body.body)
                comments.push({ id: comments.length + 1, body: body.body });
              if (body.state) {
                issue.state = body.state;
                issue.state_reason = body.state_reason ?? null;
              }
              if (failWrite)
                throw new Error("Connection lost after server accepted write");
              return "{}";
            },
            catch: () => new FactoryError({ message: "Uncertain write" }),
          }),
      }),
      Effect.provide(BunServices.layer),
    ),
  );

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "smol-workflow-"));
  factory = new Factory(root);
  workflow = new Workflow(factory);
  issue = {
    number: 1,
    title: "Stock issue",
    body: "Report",
    state: "open",
    state_reason: null,
    updated_at: "2026-01-01",
    html_url: "https://github.com/example/project/issues/1",
    labels: [{ name: "bug" }, { name: "triage" }],
  };
  comments = [];
  writes = [];
  calls = [];
  failWrite = false;
  sourceRevision = "main-1";
  for (const name of ["context", ...gates]) {
    await mkdir(join(root, ".smol-factory"), { recursive: true });
    await writeFile(join(root, ".smol-factory", `${name}.md`), name);
  }
  await run(
    writeJson(join(root, ".smol-factory/smol-factory.json"), {
      version: 1,
      slug: "example",
      name: "Example",
      repository: "example/project",
      scan_limit: 10,
      core_team_reference: "team",
      core_members: [],
      require_approval: gates,
      github_writes: "approval_required",
      repair_code: false,
      context: ".smol-factory/context.md",
      skills: Object.fromEntries(
        gates.map((g) => [g, `.smol-factory/${g}.md`]),
      ),
      evidence: { trusted_documents: [], omit_suffixes: [] },
    }),
  );
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
const proposal = async () => {
  const scan = await run(
    workflow.scan("issue", "created:2019-01-01..2023-12-31"),
  );
  const target = { kind: "issue" as const, number: 1 };
  const base = {
    target,
    fingerprint: scan.items[0]!.fingerprint,
    summary: "Needs reproduction",
    evidence: ["source.ts:12"],
  };
  const file = join(root, "proposal.json");
  await run(
    writeJson(file, {
      entries: [
        {
          ...base,
          id: "label",
          actions: [{ type: "labels", add: ["verify"], remove: ["triage"] }],
        },
        {
          ...base,
          id: "comment",
          actions: [
            {
              type: "comment",
              body: "Reproduction pending.\nPlease include current details.",
            },
          ],
        },
      ],
    }),
  );
  return run(workflow.propose(scan.id, file));
};

test("scan is bounded, read-only, and passes the requested search", async () => {
  const scan = await run(
    command(factory, ["scan", "issues", "--search", "created:<2024-01-01"]),
  );
  expect(scan).toHaveProperty("items");
  expect(writes).toHaveLength(0);
  expect(calls[0]).toContain("created:<2024-01-01");
  expect(calls[0]).toContain("--limit");
});

test("selected issue collection captures only that issue without a write", async () => {
  const scan = await run(workflow.scanTarget({ kind: "issue", number: 1 }));
  expect(scan.items.map((item) => item.target)).toEqual([
    { kind: "issue", number: 1 },
  ]);
  expect(calls.some((argv) => argv[1] === "issue" && argv[2] === "list")).toBe(
    false,
  );
  expect(writes).toEqual([]);
});

test("unapproved apply cannot write; selected approval preserves unrelated labels", async () => {
  const p = await proposal();
  await expect(run(workflow.apply(p.id))).rejects.toThrow(
    "No approved actions",
  );
  await run(
    command(factory, [
      "approve-proposal",
      p.id,
      "--entries",
      "label",
      "--statement",
      "Label that issue verify",
    ]),
  );
  await run(command(factory, ["apply", p.id]));
  expect(issue.labels.map((l) => l.name)).toEqual(["bug", "verify"]);
  expect(comments).toHaveLength(0);
  expect(writes).toHaveLength(1);
  await run(workflow.apply(p.id));
  expect(writes).toHaveLength(1);
  await run(workflow.approve(p.id, ["comment"], "Post that comment too"));
  await run(workflow.apply(p.id));
  expect(comments[0]?.body).toBe(
    "Reproduction pending.\nPlease include current details.",
  );
  expect(await run(command(factory, ["status"]))).toHaveProperty(
    "proposals",
    expect.arrayContaining([expect.objectContaining({ id: p.id })]),
  );
});

test("changed comments invalidate approval before any write", async () => {
  const p = await proposal();
  await run(workflow.approve(p.id, ["label"], "Apply the label"));
  comments.push({ id: 1, body: "New information" });
  await expect(run(workflow.apply(p.id))).rejects.toThrow(
    "GitHub state changed",
  );
  expect(writes).toHaveLength(0);
});

test("changed source and policy invalidate proposal", async () => {
  const p = await proposal();
  sourceRevision = "main-2";
  await expect(run(workflow.approve(p.id, ["label"], "Apply"))).rejects.toThrow(
    "GitHub state changed",
  );
  sourceRevision = "main-1";
  await run(workflow.approve(p.id, ["label"], "Apply"));
  await writeFile(join(root, ".smol-factory/context.md"), "New closure policy");
  await expect(run(workflow.apply(p.id))).rejects.toThrow("Policy changed");
  expect(writes).toHaveLength(0);
});

test("editing approved action content invalidates proposal identity", async () => {
  const p = await proposal();
  await run(workflow.approve(p.id, ["comment"], "Post comment"));
  const path = workflow.path("proposals", p.id);
  const data = JSON.parse(await readFile(path, "utf8"));
  data.entries[1].actions[0].body = "Changed text";
  await writeFile(path, JSON.stringify(data));
  await expect(run(workflow.apply(p.id))).rejects.toThrow(
    "Proposal identity changed",
  );
  expect(writes).toHaveLength(0);
});

test("an ambiguous accepted comment is never replayed", async () => {
  const p = await proposal();
  await run(workflow.approve(p.id, ["comment"], "Post comment"));
  failWrite = true;
  await expect(run(workflow.apply(p.id))).rejects.toThrow("Uncertain write");
  failWrite = false;
  await expect(run(workflow.apply(p.id))).rejects.toThrow("uncertain outcome");
  expect(comments).toHaveLength(1);
  expect(writes).toHaveLength(1);
});

test("disabled writes remain disabled even with explicit proposal approval", async () => {
  const configPath = join(root, ".smol-factory/smol-factory.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.github_writes = false;
  await writeFile(configPath, JSON.stringify(config));
  const p = await proposal();
  await run(workflow.approve(p.id, ["label"], "Apply label"));
  await expect(run(workflow.apply(p.id))).rejects.toThrow(
    "writes are disabled",
  );
  expect(writes).toHaveLength(0);
});

test("closure requires its own approval and records the intended reason", async () => {
  const scan = await run(workflow.scan("issue"));
  const file = join(root, "close.json");
  await run(
    writeJson(file, {
      entries: [
        {
          id: "close",
          target: { kind: "issue", number: 1 },
          fingerprint: scan.items[0]!.fingerprint,
          summary: "Expired",
          evidence: ["Agreed age policy"],
          actions: [{ type: "close", reason: "not_planned" }],
        },
      ],
    }),
  );
  const p = await run(workflow.propose(scan.id, file));
  await run(workflow.approve(p.id, ["close"], "Close that issue"));
  await run(workflow.apply(p.id));
  expect(issue.state).toBe("closed");
  expect(issue.state_reason).toBe("not_planned");
});

test("issue CLI progress persists into the TUI without GitHub writes", async () => {
  const runs = new IssueRuns(workflow);
  await run(
    command(factory, [
      "issue",
      "start",
      "1",
      "verification",
      "--statement",
      "Verify issue 1",
    ]),
  );
  const [started] = await run(runs.list());
  expect(started?.status).toBe("running");
  const id = started!.id;
  await expect(run(runs.start(1, "triage", "Triage"))).rejects.toThrow(
    "already has a running",
  );
  await run(
    command(factory, [
      "issue",
      "block",
      id,
      "--reason",
      "Need test-data permission",
    ]),
  );
  const load = createFileSource(factory.storage);
  let snapshot = await load();
  expect(latestIssueRun(snapshot, 1)?.status).toBe("blocked");
  expect(browsePrimary(snapshot, "issue", 1).detail).toBe(
    "Need test-data permission",
  );
  await run(
    command(factory, [
      "issue",
      "resume",
      id,
      "--reason",
      "Test fixture scope approved",
    ]),
  );
  const file = join(root, "result.json");
  await run(
    writeJson(file, {
      fingerprint: started!.fingerprint,
      verdict: "confirmed",
      summary: "Reproduced",
      evidence: ["report.md: API and UI evidence on Core revision abc"],
    }),
  );
  await run(command(factory, ["issue", "finish", id, "--file", file]));
  snapshot = await load();
  expect(latestIssueRun(snapshot, 1)?.result?.verdict).toBe("confirmed");
  expect(latestIssueRun(snapshot, 1)?.events.map((e) => e.status)).toEqual([
    "running",
    "blocked",
    "running",
    "completed",
  ]);
  expect(await run(command(factory, ["status"]))).toHaveProperty(
    "issueRuns",
    expect.arrayContaining([expect.objectContaining({ status: "completed" })]),
  );
  await expect(run(runs.finish(id, file))).rejects.toThrow("Only a running");
  expect(writes).toEqual([]);
});

test("issue results reject missing evidence and stale snapshots; stale runs can be blocked", async () => {
  const runs = new IssueRuns(workflow);
  const started = await run(runs.start(1, "verification", "Verify issue 1"));
  const file = join(root, "result.json");
  const result = {
    fingerprint: started.fingerprint,
    verdict: "not_reproduced",
    summary: "No failure",
    evidence: [] as string[],
  };
  await run(writeJson(file, result));
  await expect(run(runs.finish(started.id, file))).rejects.toThrow(
    "needs evidence",
  );
  await run(writeJson(file, { ...result, evidence: ["report.md"] }));
  sourceRevision = "main-2";
  await expect(run(runs.finish(started.id, file))).rejects.toThrow(
    "evidence or policy changed",
  );
  await run(runs.transition(started.id, "blocked", "Source changed"));
  await expect(
    run(runs.transition(started.id, "running", "Retry")),
  ).rejects.toThrow("evidence or policy changed");
  const fresh = await run(
    runs.start(1, "verification", "Verify current revision"),
  );
  expect(fresh.fingerprint).not.toBe(started.fingerprint);
  expect(writes).toEqual([]);
});
