import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, FileSystem } from "effect";
import { BunServices } from "@effect/platform-bun";
import { Factory } from "../src/factory";
import { Onboarding, githubRepository } from "../src/onboarding";
import { FactoryError, ProcessRunner, fail } from "../src/io";
import { findRoot, installationRoot } from "../src/paths";
import { command } from "../scripts/smol";
let root: string;
let factory: Factory;
let setup: Onboarding;
let calls: string[][];
let respond: (argv: readonly string[]) => Effect.Effect<string, FactoryError>;
const run = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | ProcessRunner>,
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provideService(ProcessRunner, {
        run: (argv) => {
          calls.push([...argv]);
          return respond(argv);
        },
      }),
      Effect.provide(BunServices.layer),
    ),
  );
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "smol-test-")));
  factory = new Factory(root);
  setup = new Onboarding(factory);
  calls = [];
  respond = () => fail("Unavailable");
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

test("GitHub identity accepts standard remotes without echoing credential-bearing URLs", () => {
  expect(githubRepository("git@github.com:acme/app.git")).toBe(
    "acme/app",
  );
  expect(githubRepository("https://github.com/acme/app.git")).toBe("acme/app");
  expect(
    githubRepository("https://secret@github.com/acme/app.git"),
  ).toBeUndefined();
});
test("init explains a missing origin without mislabeling Git failures", async () => {
  respond = (argv) =>
    argv.length === 4 ? Effect.succeed("upstream\n") : fail("Unavailable");
  await expect(run(setup.init())).rejects.toThrow(
    "No origin remote is configured.",
  );
  respond = () => fail("Unavailable");
  await expect(run(setup.init())).rejects.toThrow(
    "Could not read the origin remote.",
  );
});
test("init creates usable configuration without acceptance and preserves edits on repeat", async () => {
  await run(setup.init("acme/app"));
  expect(
    await Bun.file(join(root, ".smol-factory/smol-factory.json")).exists(),
  ).toBe(true);
  expect(await Bun.file(join(root, "smol-factory.json")).exists()).toBe(false);
  const local = JSON.parse(
    await readFile(join(root, ".smol-factory/local/config.json"), "utf8"),
  );
  expect(local.adapter[1]).toEndWith("scripts/codex-adapter.ts");
  expect(local.models.classification.model).toBe("default");
  const pkg = await run(factory.package());
  expect(pkg.context).toBe(join(root, ".smol-factory/context.md"));
  await run(factory.ready());
  expect(calls).toEqual([]);
  await writeFile(pkg.context, "Maintainer edits\n");
  await run(setup.init("different/repo"));
  expect(await readFile(pkg.context, "utf8")).toBe("Maintainer edits\n");
  expect((await run(factory.package())).config.repository).toBe("acme/app");
  await run(factory.ready());
  expect((await run(factory.states())).length).toBe(0);
});
test("doctor distinguishes valid draft from unavailable execution and GitHub access", async () => {
  await run(setup.init("acme/app"));
  const report = await run(setup.doctor());
  expect(report.configured).toBe(true);
  expect(report.ready).toBe(false);
  expect(report.checks.find((c) => c.name === "Codex settings")?.ready).toBe(
    true,
  );
  expect(calls.every((c) => c[0] === "gh" && c[3] === "GET")).toBe(true);
});
test("inspection captures committed evidence, bounded outcomes, comments and linked issues using read-only calls", async () => {
  await run(setup.init("acme/app"));
  respond = (argv) => {
    if (argv[0] === "git") {
      const cmd = argv[3];
      return Effect.succeed(
        cmd === "symbolic-ref"
          ? "refs/remotes/origin/main\n"
          : cmd === "rev-parse"
            ? "abc123\n"
            : cmd === "ls-tree"
              ? "package.json\nsrc/app.ts\n.env\n"
              : '{"scripts":{"test":"bun test"}}',
      );
    }
    const url = argv[4]!;
    if (url.startsWith("search/issues"))
      return Effect.succeed(
        JSON.stringify({
          items: [
            {
              number: url.includes("is%3Amerged") ? 1 : 2,
              title: "Fix",
              body: "Fixes #42",
              html_url: "https://github.com/acme/app/pull/1",
            },
          ],
        }),
      );
    return Effect.succeed("[]");
  };
  const result = await run(setup.inspect(2));
  expect(result.prs).toBe(2);
  const packet = JSON.parse(await readFile(result.path, "utf8"));
  expect(packet.trusted_default_confirmed).toBe(true);
  expect(packet.documents.map((d: { path: string }) => d.path)).toEqual([
    "package.json",
  ]);
  expect(packet.history.map((h: { outcome: string }) => h.outcome)).toEqual([
    "merged",
    "closed-unmerged",
  ]);
  expect(calls.some((c) => c[4]?.endsWith("issues/42"))).toBe(true);
  expect(calls.filter((c) => c[0] === "gh").every((c) => c[3] === "GET")).toBe(
    true,
  );
  expect(
    calls
      .filter((c) => c[0] === "git")
      .every((c) =>
        ["symbolic-ref", "rev-parse", "ls-tree", "show"].includes(c[3]!),
      ),
  ).toBe(true);
});
test("local-only inspection survives missing history and flags unconfirmed source", async () => {
  await run(setup.init("acme/app"));
  const result = await run(setup.inspect(3, true));
  expect(result.warnings.length).toBeGreaterThan(0);
  expect(calls.some((c) => c[0] === "gh")).toBe(false);
  await expect(run(setup.inspect(0))).rejects.toThrow("between 1 and 30");
});
test("skill install preserves an existing customized skill", async () => {
  await run(setup.installSkill());
  const file = join(root, ".agents/skills/smol-factory/SKILL.md");
  await writeFile(file, "Custom skill");
  await expect(run(setup.installSkill())).rejects.toThrow("differs");
  expect(await readFile(file, "utf8")).toBe("Custom skill");
});
test("CLI runs against an unrelated target and nested cwd discovers it", async () => {
  const child = Bun.spawn(
    [
      "bun",
      join(installationRoot, "scripts/smol.ts"),
      "--root",
      root,
      "init",
      "--repository",
      "acme/app",
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  expect(await child.exited).toBe(0);
  expect(JSON.parse(await new Response(child.stdout).text()).repository).toBe(
    "acme/app",
  );
  await mkdir(join(root, "src/nested"), { recursive: true });
  expect(findRoot(join(root, "src/nested"))).toBe(root);
  const validation = Bun.spawn(
    ["bun", join(installationRoot, "scripts/smol.ts"), "validate"],
    { cwd: join(root, "src/nested"), stdout: "pipe", stderr: "pipe" },
  );
  expect(await validation.exited).toBe(0);
  expect(
    JSON.parse(await new Response(validation.stdout).text()).repository,
  ).toBe("acme/app");
  await expect(
    run(command(factory, ["inspect", "--unexpected"])),
  ).rejects.toThrow("Usage:");
});

test("init leaves skill installation explicit and status tracks installation", async () => {
  await run(setup.init("acme/app"));
  expect(await run(setup.status())).toMatchObject({
    repository: "acme/app",
    onboarding: "complete",
    skillInstalled: false,
  });
  await run(setup.installSkill());
  expect(await run(setup.status())).toMatchObject({ skillInstalled: true });
});

test("the skill can be installed before factory initialization", async () => {
  expect(await run(setup.status())).toMatchObject({
    onboarding: "unconfigured",
    skillInstalled: false,
  });
  await run(setup.installSkill());
  expect(
    await Bun.file(join(root, ".smol-factory/smol-factory.json")).exists(),
  ).toBe(false);
  expect(await run(setup.status())).toMatchObject({
    onboarding: "unconfigured",
    skillInstalled: true,
  });
  expect(
    await readFile(join(root, ".agents/skills/smol-factory/SKILL.md"), "utf8"),
  ).toContain("Check `.smol-factory/smol-factory.json`");
});

const analysisDocument = {
  version: 1,
  repository: "acme/app",
  summary: "A sample application.",
  scope: [
    { text: "Application", basis: "observed", sources: ["README.md@abc"] },
  ],
  architecture: [],
  classification: [],
  review: [],
  verification: [],
  unresolved: ["Maintainer scope exclusions are unknown."],
};
function analysisRunner(document: unknown) {
  respond = (argv) => {
    if (argv[0] === "codex" && argv[1] === "--version")
      return Effect.succeed("codex test");
    if (argv[0] === "codex" && argv[1] === "exec") {
      return Effect.tryPromise({
        try: async () => {
          const output = argv[argv.indexOf("--output-last-message") + 1]!;
          await writeFile(output, JSON.stringify(document));
          return "";
        },
        catch: () => new FactoryError({ message: "Fixture failed" }),
      });
    }
    return fail("Unavailable");
  };
}
test("analysis launches a read-only agent and validates and renders its document", async () => {
  await run(setup.init("acme/app"));
  analysisRunner(analysisDocument);
  const result = await run(setup.analyze());
  expect(await readFile(result.path, "utf8")).toContain(
    "[observed] Application",
  );
  expect(JSON.parse(await readFile(result.document, "utf8"))).toEqual(
    analysisDocument,
  );
  const launch = calls.find(
    (argv) => argv[0] === "codex" && argv[1] === "exec",
  )!;
  expect(launch).toContain("read-only");
  expect(launch).toContain("--output-schema");
  expect(launch.at(-1)).toContain("Do not execute repository code");
  expect((await run(setup.status())).onboarding).toBe("complete");
  expect((await run(setup.status())).analysis).toEqual({
    path: result.path,
    summary: analysisDocument.summary,
  });
});
test("status ignores invalid and mismatched saved analyses", async () => {
  await run(setup.init("acme/app"));
  const folder = join(root, ".smol-factory/.runtime/onboarding", "previous");
  await mkdir(folder, { recursive: true });
  await writeFile(
    join(folder, "document.json"),
    JSON.stringify({ ...analysisDocument, repository: "other/app" }),
  );
  await writeFile(join(folder, "document.md"), "Report");
  expect((await run(setup.status())).analysis).toBeUndefined();
  await writeFile(join(folder, "document.json"), "{}");
  expect((await run(setup.status())).analysis).toBeUndefined();
});
test("analysis rejects invalid, uncited, and wrong-repository documents", async () => {
  await run(setup.init("acme/app"));
  for (const document of [
    {},
    {
      ...analysisDocument,
      scope: [{ text: "Guess", basis: "observed", sources: [] }],
    },
  ]) {
    analysisRunner(document);
    await expect(run(setup.analyze())).rejects.toThrow("does not match");
  }
  analysisRunner({ ...analysisDocument, repository: "other/app" });
  await expect(run(setup.analyze())).rejects.toThrow("different repository");
});
test("analysis reports a missing Codex harness before collecting evidence", async () => {
  await run(setup.init("acme/app"));
  await expect(run(setup.analyze())).rejects.toThrow("Codex CLI is required");
  expect(calls).toEqual([["codex", "--version"]]);
});

test("agent execution failure cannot yield an accepted document", async () => {
  await run(setup.init("acme/app"));
  respond = (argv) =>
    argv[0] === "codex" && argv[1] === "--version"
      ? Effect.succeed("codex test")
      : fail("Unavailable");
  await expect(run(setup.analyze())).rejects.toThrow(
    "No document was accepted",
  );
  expect((await run(setup.status())).onboarding).toBe("complete");
});
