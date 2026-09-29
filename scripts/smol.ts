#!/usr/bin/env bun
import { assessmentStatus } from "../src/assessment";
import { Effect } from "effect";
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { resolve } from "node:path";
import { Factory } from "../src/factory";
import { Onboarding } from "../src/onboarding";
import { parseRoot } from "../src/paths";
import { gates, type Gate } from "../src/schema";
import {
  fail,
  ProcessRunner,
  processRunner,
  readJson,
  withLock,
} from "../src/io";

export const help = `smol-factory · approval-gated PR assessment
Usage: smol [--root PATH] [COMMAND]
  (no command) / tui     Open the terminal UI
  init [--repository OWNER/NAME]
  analyze               Run Codex and validate its onboarding document
  inspect [--history-limit 1..30] [--local-only]
  doctor
  skill install [--global]
  scan [--pr NUMBER]
  classify RUN_ID
  validate
  status
  approve NUMBER GATE --statement 'Exact maintainer instruction'
  decide NUMBER GATE --reason 'Exact decision and rationale'
  launch NUMBER GATE
  finish NUMBER GATE RESULT_JSON
GATE: classification | review | verification
All GitHub access is read-only. Passing findings never grant approval.`;

export const command = (factory: Factory, args: readonly string[]) =>
  Effect.gen(function* () {
    const [action, arg, gate, option, text] = args;
    const setup = new Onboarding(factory);
    if (
      action === "init" &&
      (args.length === 1 || (args.length === 3 && arg === "--repository"))
    )
      return yield* setup.init(gate);
    if (action === "analyze" && args.length === 1)
      return yield* setup.analyze();
    if (action === "doctor" && args.length === 1) return yield* setup.doctor();
    if (
      action === "skill" &&
      arg === "install" &&
      (args.length === 2 || (args.length === 3 && gate === "--global"))
    )
      return yield* setup.installSkill(gate === "--global");
    if (action === "inspect") {
      let limit = 12,
        localOnly = false;
      for (let i = 1; i < args.length; i++) {
        if (args[i] === "--local-only") localOnly = true;
        else if (args[i] === "--history-limit" && args[i + 1])
          limit = Number(args[++i]);
        else return yield* fail(help);
      }
      return yield* setup.inspect(limit, localOnly);
    }
    if (action === "validate" && args.length === 1) {
      const p = yield* factory.package();
      return {
        repository: p.config.repository,
        slug: p.config.slug,
        config: p.configPath,
        context: p.context,
        skills: p.skills,
      };
    }
    if (action === "status" && args.length === 1)
      return assessmentStatus(yield* factory.states());
    if (
      action === "scan" &&
      (args.length === 1 ||
        (args.length === 3 && arg === "--pr" && /^[1-9]\d*$/.test(gate ?? "")))
    )
      return yield* factory.scan(gate ? Number(gate) : undefined);
    if (action === "classify" && args.length === 2 && arg)
      return yield* factory.classify(arg);
    if (!/^[1-9]\d*$/.test(arg ?? "") || !gates.includes(gate as Gate))
      return yield* fail(help);
    const number = Number(arg);
    if (!Number.isSafeInteger(number))
      return yield* fail("PR number must be a safe positive integer");
    const stage = gate as Gate;
    if (
      action === "approve" &&
      args.length === 5 &&
      option === "--statement" &&
      text !== undefined
    )
      return yield* factory.approve(number, stage, text);
    if (
      action === "decide" &&
      args.length === 5 &&
      option === "--reason" &&
      text !== undefined
    )
      return yield* factory.decide(number, stage, text);
    if (action === "launch" && args.length === 3)
      return yield* factory.launch(number, stage);
    if (action === "finish" && args.length === 4 && option)
      return yield* factory.finish(
        number,
        stage,
        yield* readJson(resolve(option)),
      );
    return yield* fail(help);
  });

if (import.meta.main) {
  const { root, args } = parseRoot(process.argv.slice(2));
  if (args.length === 1 && ["--help", "-h"].includes(args[0]!))
    console.log(help);
  else if (!args.length || (args.length === 1 && args[0] === "tui")) {
    const { startTui } = await import("../tui/main");
    await startTui(root);
  } else {
    const factory = new Factory(root);
    const program = command(factory, args);
    BunRuntime.runMain(
      (["status", "validate", "doctor", "skill"].includes(args[0]!)
        ? program
        : withLock(factory.storage, program)
      ).pipe(
        Effect.provideService(ProcessRunner, processRunner),
        Effect.provide(BunServices.layer),
        Effect.tap((value) =>
          Effect.sync(() =>
            console.log(JSON.stringify(value ?? null, null, 2)),
          ),
        ),
        Effect.tapError((error) =>
          Effect.sync(() =>
            console.error(
              `Factory stopped: ${error._tag === "FactoryError" ? error.message : `Invalid input or local I/O failure (${error._tag})`}`,
            ),
          ),
        ),
      ),
      { disableErrorReporting: true },
    );
  }
}
