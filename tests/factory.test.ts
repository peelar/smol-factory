import { afterEach, beforeEach, expect, test } from "bun:test";
import { Deferred, Effect, Fiber, FileSystem } from "effect";
import { BunServices } from "@effect/platform-bun";
import {
  mkdtemp,
  mkdir,
  rm,
  writeFile,
  readFile,
  readdir,
  symlink,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, resolve, relative } from "node:path";
import { Workflow } from "../src/workflow";
import { Factory, canonical, digest } from "../src/factory";
import {
  FactoryError,
  ProcessRunner,
  readJson,
  writeJson,
  withLock,
} from "../src/io";
import {
  gates,
  type GithubPr,
  type PullRequest,
  type Result,
} from "../src/schema";
import { command } from "../scripts/smol";

let root: string, factory: Factory, pr: GithubPr, value: PullRequest;
let calls: readonly string[][];
let respond: (argv: readonly string[]) => Effect.Effect<string, FactoryError>;
const run = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | ProcessRunner>,
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provideService(ProcessRunner, {
        run: (argv) => {
          calls = [...calls, [...argv]];
          return respond(argv);
        },
      }),
      Effect.provide(BunServices.layer),
    ),
  );
const result = (verdict: Result["verdict"] = "pass"): Result => ({
  fingerprint: value.fingerprint,
  verdict,
  summary: "Evidence-based finding",
  findings: [],
  evidence: ["source.ts:12"],
});
const json = (data: unknown) => Effect.succeed(JSON.stringify(data));
const ready = async () => {
  await run(factory.recordResult(value, "classification", result()));
  await run(factory.approve(1, "classification", "Review this PR"));
};
beforeEach(async () => {
  const parent = resolve(import.meta.dir, "../.runtime/tests");
  await mkdir(parent, { recursive: true });
  root = await mkdtemp(join(parent, "effect-"));
  factory = new Factory(root);
  calls = [];
  await run(
    writeJson(join(root, ".smol-factory/smol-factory.json"), {
      version: 1,
      slug: "example",
      name: "Example",
      repository: "example/project",
      scan_limit: 10,
      core_team_reference: "example/team",
      core_members: ["core"],
      require_approval: gates,
      github_writes: false,
      repair_code: false,
      context: ".smol-factory/context.md",
      skills: Object.fromEntries(
        gates.map((gate) => [gate, `.smol-factory/skills/${gate}/SKILL.md`]),
      ),
      evidence: {
        trusted_documents: ["AGENTS.md"],
        omit_suffixes: [".generated"],
      },
    }),
  );
  for (const path of [
    "context.md",
    ...gates.map((gate) => `skills/${gate}/SKILL.md`),
  ]) {
    const target = join(root, ".smol-factory", path);
    await mkdir(resolve(target, ".."), { recursive: true });
    await writeFile(target, `Example instructions for ${path}\n`);
  }
  await run(
    writeJson(join(root, ".smol-factory/local/config.json"), {
      adapter: ["test-adapter"],
      max_concurrent: 2,
      stage_limits: { verification: 1 },
    }),
  );
  pr = {
    number: 1,
    state: "open",
    draft: false,
    user: { login: "external", type: "User" },
    head: { sha: "a".repeat(40) },
    base: { sha: "b".repeat(40) },
    title: "Fix example",
    body: "Actual rationale",
    html_url: "https://example.test/1",
    changed_files: 1,
  };
  respond = (argv) =>
    argv[0] === "gh"
      ? json(pr)
      : json({ agent: "test-pr-1", resume: { id: "opaque-handle" } });
  value = {
    number: 1,
    title: pr.title,
    url: pr.html_url,
    head: pr.head.sha,
    base: pr.base.sha,
    fingerprint: await run(factory.fingerprint(pr)),
    results: {},
    packet: join(root, ".smol-factory/.runtime/packet.json"),
    approvals: {},
    history: [],
    status: "awaiting_classification",
  };
  await run(factory.save(value));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

test("eligibility excludes core members, drafts, bots and closed PRs", async () => {
  expect(await run(factory.eligible(pr))).toBe(true);
  for (const change of [
    { user: { login: "CORE", type: "User" } },
    { author_association: "MEMBER" },
    { author_association: "OWNER" },
    { draft: true },
    { state: "closed" },
    { user: { login: "robot", type: "Bot" } },
    { user: null },
  ])
    expect(await run(factory.eligible({ ...pr, ...change }))).toBe(false);
  expect(
    await run(factory.eligible({ ...pr, author_association: "COLLABORATOR" })),
  ).toBe(true);
});
test("discovery filters before taking ten across pages; all requests are GET", async () => {
  respond = (argv) =>
    json(
      argv.at(-1)!.endsWith("page=1")
        ? Array.from({ length: 100 }, (_, n) => ({
            ...pr,
            number: n + 1,
            user: { login: n % 2 ? "core" : "member", type: "User" },
            author_association: n % 2 ? "NONE" : "MEMBER",
          }))
        : Array.from({ length: 15 }, (_, n) => ({ ...pr, number: 200 + n })),
    );
  expect((await run(factory.discover())).map((p) => p.number)).toEqual(
    Array.from({ length: 10 }, (_, n) => 200 + n),
  );
  expect(calls).toHaveLength(2);
  expect(
    calls.every((argv) => argv.slice(0, 4).join(" ") === "gh api --method GET"),
  ).toBe(true);
});
test("pass never approves or launches", async () => {
  await run(factory.recordResult(value, "classification", result()));
  expect((await run(factory.state(1))).status).toBe(
    "classification:awaiting_approval",
  );
  await expect(run(factory.launch(1, "review"))).rejects.toThrow(
    "Missing explicit approval",
  );
  expect(calls.some((c) => c[0] === "test-adapter")).toBe(false);
});
test("blocked gates cannot be approved", async () => {
  for (const verdict of ["needs_changes", "needs_decision"] as const) {
    await run(factory.recordResult(value, "classification", result(verdict)));
    await expect(
      run(factory.approve(1, "classification", "Go ahead")),
    ).rejects.toThrow("not passing");
  }
});
test("approval binds revision, base, description, title and context", async () => {
  await run(factory.recordResult(value, "classification", result()));
  for (const change of [
    { head: { sha: "c".repeat(40) } },
    { base: { sha: "d".repeat(40) } },
    { body: "New scope" },
    { title: "New title" },
  ]) {
    respond = () => json({ ...pr, ...change });
    await expect(
      run(factory.approve(1, "classification", "Go ahead")),
    ).rejects.toThrow("stale");
  }
  respond = () => json(pr);
  await writeFile(
    join(root, ".smol-factory/context.md"),
    "Changed product policy",
  );
  await expect(
    run(factory.approve(1, "classification", "Go ahead")),
  ).rejects.toThrow("stale");
});
test("stage skill changes invalidate assessment", async () => {
  await writeFile(
    join(root, ".smol-factory/skills/review/SKILL.md"),
    "Changed review policy",
  );
  await expect(
    run(factory.approve(1, "classification", "Go ahead")),
  ).rejects.toThrow("stale");
});
test("package paths and symlinks cannot escape", async () => {
  const outside = resolve(import.meta.dir, "../README.md");
  const path = join(root, ".smol-factory/smol-factory.json");
  const config = JSON.parse(await readFile(path, "utf8"));
  await run(writeJson(path, { ...config, context: relative(root, outside) }));
  await expect(run(factory.package())).rejects.toThrow("escapes");
  await symlink(outside, join(root, ".smol-factory/link.md"));
  await run(writeJson(path, { ...config, context: ".smol-factory/link.md" }));
  await expect(run(factory.package())).rejects.toThrow("escapes");
});
test("stale results cannot replace newer revision", async () => {
  await expect(
    run(
      factory.recordResult(value, "classification", {
        ...result(),
        fingerprint: "outdated",
      }),
    ),
  ).rejects.toThrow("stale result");
  expect((await run(factory.state(1))).results).toEqual({});
});
test("classification approval permits only review and late approval cannot regress", async () => {
  await ready();
  await expect(run(factory.launch(1, "verification"))).rejects.toThrow(
    "approval of review",
  );
  await expect(
    run(factory.approve(1, "classification", "Again")),
  ).rejects.toThrow("awaiting approval");
});
test("launch failure reserves slot for inspection and prevents duplicate launch", async () => {
  await ready();
  respond = (argv) =>
    argv[0] === "gh"
      ? json(pr)
      : Effect.fail(new FactoryError({ message: "Launch timeout" }));
  await expect(run(factory.launch(1, "review"))).rejects.toThrow("timeout");
  expect((await run(factory.state(1))).status).toBe("running:review");
  await expect(run(factory.launch(1, "review"))).rejects.toThrow(
    "already running",
  );
});
test("new assessment invalidates all downstream results and approvals", async () => {
  for (const gate of gates) {
    value.results[gate] = result();
    value.approvals[gate] = {
      fingerprint: value.fingerprint,
      statement: "Approved",
      time: "now",
    };
  }
  await run(factory.recordResult(value, "classification", result()));
  const saved = await run(factory.state(1));
  expect(saved.approvals).toEqual({});
  expect(Object.keys(saved.results)).toEqual(["classification"]);
});
test("running capacity is checked before invoking adapter", async () => {
  await ready();
  await run(
    writeJson(join(root, ".smol-factory/local/config.json"), {
      max_concurrent: 1,
    }),
  );
  await run(factory.save({ ...value, number: 2, status: "running:review" }));
  await expect(run(factory.launch(1, "review"))).rejects.toThrow(
    "slots occupied",
  );
  expect(calls.some((c) => c[0] === "test-adapter")).toBe(false);
});
test("verification stage is serialized independently of total capacity", async () => {
  value.results.review = result();
  value.approvals.review = {
    fingerprint: value.fingerprint,
    statement: "Verify",
    time: "now",
  };
  value.status = "review:approved";
  await run(factory.save(value));
  await run(
    factory.save({ ...value, number: 2, status: "running:verification" }),
  );
  await expect(run(factory.launch(1, "verification"))).rejects.toThrow(
    "verification stage slots",
  );
});
test("full progression needs all three approvals and preserves opaque adapter handles", async () => {
  await ready();
  await run(factory.launch(1, "review"));
  await run(factory.finish(1, "review", result()));
  await expect(run(factory.launch(1, "verification"))).rejects.toThrow(
    "approval of review",
  );
  await run(factory.approve(1, "review", "Verify this PR"));
  await run(factory.launch(1, "verification"));
  await run(factory.finish(1, "verification", result()));
  expect((await run(factory.state(1))).status).toBe(
    "verification:awaiting_approval",
  );
  await run(factory.approve(1, "verification", "Accept verification"));
  const saved = await run(factory.state(1));
  expect(saved.status).toBe("ready_for_maintainer_review");
  expect(saved.thread?.resume).toEqual({ id: "opaque-handle" });
  expect(
    await readFile(
      join(root, ".smol-factory/.runtime/prs/1/verification-prompt.md"),
      "utf8",
    ),
  ).toContain("The host records it and stops for maintainer approval.");
});
test("finish only accepts the active gate; overrides retain history and require approval", async () => {
  await expect(run(factory.finish(1, "review", result()))).rejects.toThrow(
    "active authorized gate",
  );
  await run(
    factory.recordResult(value, "classification", result("needs_changes")),
  );
  await expect(run(factory.decide(1, "classification", " "))).rejects.toThrow(
    "rationale",
  );
  await run(
    factory.decide(1, "classification", "Explicit maintainer exception"),
  );
  const saved = await run(factory.state(1));
  expect(saved.status).toBe("classification:awaiting_approval");
  expect(saved.approvals).toEqual({});
  expect(saved.history.some((h) => h.text.includes("needs_changes"))).toBe(
    true,
  );
});
test("fingerprints use deterministic ASCII JSON and sorted keys", () => {
  expect(canonical({ z: [true, null], a: "Zażółć 😀\u007f" })).toBe(
    '{"a": "Za\\u017c\\u00f3\\u0142\\u0107 \\ud83d\\ude00\\u007f", "z": [true, null]}',
  );
  expect(digest({ b: 2, a: 1 })).toBe(
    "d8497d9d82770a70729261095aa98f7ef5154d7af499f8037b6ca250296785a6",
  );
});
test("lock rejects concurrent commands and releases on failure", async () => {
  await run(
    withLock(
      root,
      Effect.gen(function* () {
        const attempt = yield* Effect.result(withLock(root, Effect.void));
        expect(attempt._tag).toBe("Failure");
      }),
    ),
  );
  await expect(
    run(withLock(root, Effect.fail(new Error("expected")))),
  ).rejects.toThrow("expected");
  await run(withLock(root, Effect.void));
});
test("interrupting a command releases its scoped lock", async () => {
  await run(
    Effect.gen(function* () {
      const acquired = yield* Deferred.make<void>();
      const fiber = yield* Effect.forkChild(
        withLock(
          root,
          Deferred.succeed(acquired, undefined).pipe(
            Effect.andThen(Effect.never),
          ),
        ),
      );
      yield* Deferred.await(acquired);
      yield* Fiber.interrupt(fiber);
      yield* withLock(root, Effect.void);
    }),
  );
});

test("CLI validates arguments and validate/status never invoke GitHub", async () => {
  const validation = await run(command(factory, ["validate"]));
  expect(validation).toHaveProperty("repository", "example/project");
  const status = await run(command(factory, ["status"]));
  expect(status).toMatchObject({
    version: 1,
    freshness: "local_snapshot",
    counts: { total: 1 },
    assessments: [
      { number: 1, next: { actor: "harness", action: "classify_scan" } },
    ],
  });
  expect(calls).toEqual([]);
  for (const args of [
    [],
    ["launch", "1", "invalid"],
    ["approve", "1", "review"],
    ["scan", "--pr", "-1"],
    ["status", "extra"],
  ])
    await expect(run(command(factory, args))).rejects.toThrow("Usage:");
});

const scanResponses = (argv: readonly string[]) => {
  const endpoint = argv.at(-1)!;
  if (endpoint.includes("/contents/"))
    return json({
      content: Buffer.from("Trusted guidance").toString("base64"),
    });
  if (endpoint.includes("/comments?") || endpoint.includes("/reviews?"))
    return json([]);
  if (endpoint.includes("/files?"))
    return json([
      {
        filename: "source.ts",
        status: "modified",
        additions: 1,
        deletions: 1,
        patch: "@@\n-old\n+new",
      },
    ]);
  if (endpoint.includes("/pulls?")) {
    const { changed_files: _detailOnly, ...listed } = pr;
    return json([listed]);
  }
  return json(pr);
};
test("discovery failure leaves no incomplete scan directory", async () => {
  respond = () =>
    Effect.fail(new FactoryError({ message: "GitHub unavailable" }));
  await expect(run(factory.scan())).rejects.toThrow("GitHub unavailable");
  const folder = join(root, ".smol-factory/.runtime/scans");
  await expect(readdir(folder)).rejects.toMatchObject({ code: "ENOENT" });
});
test("scan captures evidence and classification validates the entire batch before saving", async () => {
  respond = scanResponses;
  const manifest = await run(factory.scan());
  expect(manifest.pending).toEqual([1]);
  const state = await run(factory.state(1));
  expect(state.author).toBe("external");
  expect(
    await readFile(join(root, ".smol-factory/assessments/pr-1.md"), "utf8"),
  ).toContain("Author: @external");
  const packet = await run(readJson(state.packet!));
  expect(packet).toHaveProperty("trusted_base_documents", {
    "AGENTS.md": "Trusted guidance",
  });
  respond = (argv) =>
    argv[0] === "gh"
      ? scanResponses(argv)
      : Effect.gen(function* () {
          const request = JSON.parse(
            yield* (yield* FileSystem.FileSystem).readFileString(argv.at(-1)!),
          );
          yield* writeJson(request.output_path, {
            results: [{ ...result(), number: 1 }],
          });
          return "{}";
        }).pipe(
          Effect.mapError(() => new FactoryError({ message: "Fixture error" })),
          Effect.provide(BunServices.layer),
        );
  await run(factory.classify(manifest.id));
  expect((await run(factory.state(1))).status).toBe(
    "classification:awaiting_approval",
  );
  expect(calls.filter((c) => c[0] === "test-adapter")).toHaveLength(1);
  expect(await run(factory.classify(manifest.id))).toEqual({ reused: [1] });
  const reused = await run(factory.scan());
  expect(reused.pending).toEqual([]);
});
test("classification rejects duplicates and stale output without recording any result", async () => {
  respond = scanResponses;
  const manifest = await run(factory.scan());
  for (const results of [
    [
      { ...result(), number: 1 },
      { ...result(), number: 1 },
    ],
    [{ ...result(), number: 1, fingerprint: "stale" }],
  ]) {
    respond = (argv) =>
      argv[0] === "gh"
        ? scanResponses(argv)
        : Effect.gen(function* () {
            const request = JSON.parse(
              yield* (yield* FileSystem.FileSystem).readFileString(
                argv.at(-1)!,
              ),
            );
            yield* writeJson(request.output_path, { results });
            return "{}";
          }).pipe(
            Effect.mapError(
              () => new FactoryError({ message: "Fixture error" }),
            ),
            Effect.provide(BunServices.layer),
          );
    await expect(run(factory.classify(manifest.id))).rejects.toThrow();
    expect((await run(factory.state(1))).results).toEqual({});
  }
});

test("TUI decisions reject a changed displayed assessment and approval does not launch", async () => {
  const { performAction } = await import("../tui/actions");
  await run(factory.recordResult(value, "classification", result()));
  await expect(
    run(
      performAction(factory, {
        kind: "approve",
        number: 1,
        gate: "classification",
        fingerprint: "old-screen",
      }),
    ),
  ).rejects.toThrow("displayed assessment changed");
  expect(
    (await run(factory.state(1))).approvals.classification,
  ).toBeUndefined();
  await run(
    performAction(factory, {
      kind: "approve",
      number: 1,
      gate: "classification",
      fingerprint: value.fingerprint,
    }),
  );
  expect((await run(factory.state(1))).status).toBe("classification:approved");
  expect(calls.some((c) => c[0] === "test-adapter")).toBe(false);
});

test("TUI classification refuses a revision newer than the selected preview", async () => {
  const { performAction } = await import("../tui/actions");
  await expect(
    run(
      performAction(factory, {
        kind: "classify-target",
        number: 1,
        head: "old-preview",
      }),
    ),
  ).rejects.toThrow("changed since the preview");
  expect((await run(factory.state(1))).status).toBe("awaiting_classification");
  expect(calls.some((call) => call[0] === "test-adapter")).toBe(false);
});

test("assessment leads with current stages and retains every finding and evidence item", async () => {
  await run(
    factory.recordResult(value, "classification", {
      ...result(),
      summary:
        "Fits existing behavior. Limits: source inspection only; no tests run.",
      findings: ["first finding", "second finding", "third finding"],
      evidence: ["first source", "second source", "third source"],
    }),
  );
  const report = await readFile(
    join(root, ".smol-factory/assessments/pr-1.md"),
    "utf8",
  );
  expect(report.indexOf("## Current assessment")).toBeLessThan(
    report.indexOf("## History"),
  );
  expect(report).toContain("classification · Needs approval");
  expect(report).toContain("Await explicit approval of classification.");
  expect(report).toContain("third finding");
  expect(report).toContain("third source");
});

test("dead process locks recover while concurrent callers stay exclusive", async () => {
  const child = spawnSync(process.execPath, ["-e", ""]);
  expect(child.status).toBe(0);
  const path = join(root, ".runtime/factory.lock.d");
  await mkdir(path, { recursive: true });
  await writeFile(
    join(path, "owner.json"),
    JSON.stringify({
      pid: child.pid,
      started: new Date().toISOString(),
    }),
  );
  let entered = 0;
  const outcomes = await Promise.allSettled(
    [1, 2, 3].map(() =>
      run(
        withLock(
          root,
          Effect.gen(function* () {
            entered++;
            yield* Effect.sleep("100 millis");
          }),
        ),
      ),
    ),
  );
  expect(entered).toBe(1);
  expect(
    outcomes.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  await run(withLock(root, Effect.void));
});

test("live and unknown lock owners are preserved", async () => {
  const path = join(root, ".runtime/factory.lock.d");
  await mkdir(path, { recursive: true });
  const owner = JSON.stringify({
    pid: process.pid,
    started: new Date().toISOString(),
  });
  await writeFile(join(path, "owner.json"), owner);
  await expect(run(withLock(root, Effect.void))).rejects.toThrow(
    `PID ${process.pid}`,
  );
  expect(await readFile(join(path, "owner.json"), "utf8")).toBe(owner);
  await writeFile(join(path, "owner.json"), "{}");
  await expect(run(withLock(root, Effect.void))).rejects.toThrow(
    "Cannot identify",
  );
  expect(await readFile(join(path, "owner.json"), "utf8")).toBe("{}");
});

test("agent can submit classification without launching an adapter", async () => {
  const id = "agent-scan";
  const file = join(root, "results.json");
  await run(
    writeJson(join(factory.storage, ".runtime/scans", id, "manifest.json"), {
      id,
      created: "2026-09-29",
      prs: [1],
      pending: [1],
    }),
  );
  await run(writeJson(file, { results: [{ ...result(), number: 1 }] }));
  await run(command(factory, ["assess", id, "--file", file]));
  expect((await run(factory.state(1))).status).toBe(
    "classification:awaiting_approval",
  );
  expect(calls.some((argv) => argv[0] === "test-adapter")).toBe(false);
});

test("agent-run review requires approval and can finish without an adapter", async () => {
  await expect(run(command(factory, ["start", "1", "review"]))).rejects.toThrow(
    "Missing explicit approval",
  );
  await ready();
  const started = await run(command(factory, ["start", "1", "review"]));
  expect(started).toHaveProperty("prompt_path");
  expect((await run(factory.state(1))).status).toBe("running:review");
  await run(factory.finish(1, "review", result()));
  expect((await run(factory.state(1))).status).toBe("review:awaiting_approval");
  expect(calls.some((argv) => argv[0] === "test-adapter")).toBe(false);
});

test("PR proposal advancement binds the submitted assessment and never publishes implicitly", async () => {
  respond = (argv) => {
    if (argv[1] === "pr" && argv[2] === "list") return json([{ number: 1 }]);
    if (argv.at(-1)?.endsWith("/issues/1"))
      return json({
        number: 1,
        title: pr.title,
        body: pr.body,
        state: "open",
        updated_at: "2026-09-29",
        html_url: pr.html_url,
        labels: [],
        pull_request: {},
      });
    return scanResponses(argv);
  };
  const workflow = new Workflow(factory);
  const scan = await run(workflow.scan("pr"));
  expect(scan.assessmentScan?.prs).toEqual([1]);
  const state = await run(factory.state(1));
  const resultsFile = join(root, "agent-results.json");
  await run(
    writeJson(resultsFile, {
      results: [{ ...result(), number: 1, fingerprint: state.fingerprint }],
    }),
  );
  await run(factory.assess(scan.assessmentScan!.id, resultsFile));
  const file = join(root, "advance.json");
  await run(
    writeJson(file, {
      entries: [
        {
          id: "review",
          target: { kind: "pr", number: 1 },
          fingerprint: scan.items[0]!.fingerprint,
          summary: "Fits repository scope",
          evidence: ["source.ts"],
          actions: [{ type: "advance", gate: "classification" }],
        },
      ],
    }),
  );
  const proposal = await run(workflow.propose(scan.id, file));
  await run(
    workflow.approve(proposal.id, ["review"], "Advance this PR to review"),
  );
  const changed = await run(factory.state(1));
  changed.results.classification = {
    ...changed.results.classification!,
    summary: "Changed finding",
  };
  await run(factory.save(changed));
  await expect(run(workflow.apply(proposal.id))).rejects.toThrow(
    "Assessment changed",
  );
  const revised = await run(workflow.propose(scan.id, file));
  await run(
    workflow.approve(revised.id, ["review"], "Approve the revised finding"),
  );
  await run(workflow.apply(revised.id));
  expect((await run(factory.state(1))).status).toBe("classification:approved");
  expect(calls.some((argv) => argv[0] === "test-adapter")).toBe(false);
  expect(
    calls
      .filter((argv) => argv[1] === "api")
      .every((argv) => argv[3] === "GET"),
  ).toBe(true);
});
