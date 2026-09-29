#!/usr/bin/env bun
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

type Request = {
  factory_root: string;
  storage_root: string;
  stage: "classification" | "review" | "verification";
  prompt_path: string;
  output_path?: string;
  schema_path?: string;
  model?: { model?: string; reasoning?: string };
  pr?: { number: number; head: string };
};

const run = (argv: string[]) => {
  const result = spawnSync(argv[0]!, argv.slice(1), { stdio: "ignore" });
  if (result.status !== 0) throw new Error(`${argv[0]} failed`);
};
const modelArgs = (request: Request) => [
  ...(request.model?.model && request.model.model !== "default"
    ? ["--model", request.model.model]
    : []),
  ...(request.model?.reasoning
    ? ["-c", `model_reasoning_effort=${request.model.reasoning}`]
    : []),
];
const checkpoint = async (path: string, data: Record<string, unknown>) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + "\n");
};

async function worker(
  request: Request,
  workspace: string,
  checkpointPath: string,
) {
  const base = { stage: request.stage, pr: request.pr?.number, workspace };
  try {
    if (
      !request.pr ||
      !Number.isSafeInteger(request.pr.number) ||
      request.pr.number < 1 ||
      !/^[a-f0-9]{40}$/i.test(request.pr.head)
    )
      throw new Error("Invalid frozen PR revision");
    await checkpoint(checkpointPath, { ...base, status: "preparing" });
    if (!existsSync(workspace)) {
      run([
        "git",
        "-C",
        request.factory_root,
        "fetch",
        "--no-tags",
        "origin",
        `refs/pull/${request.pr.number}/head`,
      ]);
      const fetched = spawnSync(
        "git",
        ["-C", request.factory_root, "rev-parse", "FETCH_HEAD"],
        { encoding: "utf8" },
      );
      if (fetched.status !== 0 || fetched.stdout.trim() !== request.pr.head)
        throw new Error("Fetched PR revision changed");
      await mkdir(dirname(workspace), { recursive: true });
      run([
        "git",
        "-C",
        request.factory_root,
        "-c",
        "core.hooksPath=/dev/null",
        "worktree",
        "add",
        "--detach",
        workspace,
        request.pr.head,
      ]);
    }
    const checked = spawnSync("git", ["-C", workspace, "rev-parse", "HEAD"], {
      encoding: "utf8",
    });
    if (checked.status !== 0 || checked.stdout.trim() !== request.pr.head)
      throw new Error("Workspace revision does not match frozen PR");
    const output = join(
      request.storage_root,
      ".runtime/prs",
      String(request.pr.number),
      `${request.stage}-codex-result.json`,
    );
    await checkpoint(checkpointPath, { ...base, status: "running" });
    const child = spawn(
      "codex",
      [
        "exec",
        "--json",
        "--cd",
        workspace,
        "--sandbox",
        request.stage === "review" ? "read-only" : "workspace-write",
        "--output-schema",
        join(import.meta.dir, "result.schema.json"),
        "--output-last-message",
        output,
        ...modelArgs(request),
        `Read ${request.prompt_path}. Perform only its approved ${request.stage} stage. Return the result JSON as your final response; the host records it. Do not invoke smol finish yourself.`,
      ],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    let pending = "";
    let session: string | undefined;
    let checkpointWrite = Promise.resolve();
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      pending += chunk;
      if (pending.length > 1024 * 1024) pending = "";
      for (;;) {
        const index = pending.indexOf("\n");
        if (index < 0) break;
        const line = pending.slice(0, index);
        pending = pending.slice(index + 1);
        try {
          const event = JSON.parse(line);
          if (
            event.type === "thread.started" &&
            /^[a-f0-9-]{36}$/i.test(event.thread_id)
          ) {
            session = event.thread_id;
            checkpointWrite = checkpointWrite.then(() =>
              checkpoint(checkpointPath, {
                ...base,
                status: "running",
                session,
              }),
            );
          }
        } catch {
          /* Codex event metadata only. */
        }
      }
    });
    const exit = await new Promise<number | null>((resolve) => {
      child.on("close", resolve);
      child.on("error", () => resolve(-1));
    });
    await checkpointWrite;
    if (exit !== 0 || !existsSync(output))
      throw new Error("Codex stage did not produce a result");
    const launchLock = join(request.storage_root, ".runtime/factory.lock.d");
    for (let i = 0; i < 100 && existsSync(launchLock); i++)
      await new Promise((resolve) => setTimeout(resolve, 100));
    run([
      "bun",
      join(import.meta.dir, "smol.ts"),
      "--root",
      request.factory_root,
      "finish",
      String(request.pr.number),
      request.stage,
      output,
    ]);
    await checkpoint(checkpointPath, { ...base, status: "finished", session });
  } catch (error) {
    await checkpoint(checkpointPath, {
      ...base,
      status: "failed",
      detail: error instanceof Error ? error.message : "Stage failed",
    });
  }
}

async function main() {
  const [action, requestPath, workspace, checkpointPath] =
    process.argv.slice(2);
  if (!requestPath) throw new Error("Missing request");
  const request = JSON.parse(await readFile(requestPath, "utf8")) as Request;
  if (action === "worker") {
    if (!workspace || !checkpointPath) throw new Error("Missing worker paths");
    await worker(request, workspace, checkpointPath);
    return;
  }
  if (action === "classify") {
    if (
      !request.output_path ||
      !request.schema_path ||
      request.stage !== "classification"
    )
      throw new Error("Invalid classification request");
    run([
      "codex",
      "exec",
      "--sandbox",
      "read-only",
      "--cd",
      request.factory_root,
      "--output-schema",
      request.schema_path,
      "--output-last-message",
      request.output_path,
      ...modelArgs(request),
      `Read ${request.prompt_path}. Classify only the requested PRs. Return JSON matching the supplied schema.`,
    ]);
    console.log("{}");
    return;
  }
  if (
    action === "launch" &&
    request.pr &&
    ["review", "verification"].includes(request.stage)
  ) {
    const workspace = join(
      request.storage_root,
      ".runtime/worktrees",
      `pr-${request.pr.number}-${request.pr.head}`,
    );
    const checkpointPath = join(
      request.storage_root,
      ".runtime/prs",
      String(request.pr.number),
      `${request.stage}-adapter.json`,
    );
    await checkpoint(checkpointPath, {
      stage: request.stage,
      pr: request.pr.number,
      workspace,
      status: "starting",
    });
    const child = spawn(
      "bun",
      [import.meta.filename, "worker", requestPath, workspace, checkpointPath],
      {
        detached: true,
        stdio: "ignore",
      },
    );
    child.on(
      "error",
      () =>
        void checkpoint(checkpointPath, {
          stage: request.stage,
          pr: request.pr?.number,
          workspace,
          status: "failed",
          detail: "Could not start Codex worker",
        }),
    );
    if (!child.pid) throw new Error("Could not start Codex worker");
    child.unref();
    console.log(
      JSON.stringify({
        agent: "codex",
        workspace,
        checkpoint: checkpointPath,
        pid: child.pid,
      }),
    );
    return;
  }
  throw new Error("Unsupported adapter action");
}

try {
  await main();
} catch {
  console.error("Codex adapter failed; inspect the local adapter checkpoint.");
  process.exitCode = 1;
}
