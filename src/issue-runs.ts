import { Effect, FileSystem, Schema } from "effect";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Workflow } from "./workflow";
import { fail, readSchema, writeJson } from "./io";

const stageSchema = Schema.Literals(["triage", "verification"]);
const resultSchema = Schema.Struct({
  fingerprint: Schema.NonEmptyString,
  verdict: Schema.Literals([
    "confirmed",
    "already_fixed",
    "not_reproduced",
    "needs_verification",
    "out_of_scope",
  ]),
  summary: Schema.NonEmptyString,
  evidence: Schema.Array(Schema.NonEmptyString),
});
export const issueRunSchema = Schema.Struct({
  id: Schema.String,
  number: Schema.Int.check(Schema.isGreaterThan(0)),
  repository: Schema.String,
  scan: Schema.String,
  policy: Schema.String,
  fingerprint: Schema.String,
  stage: stageSchema,
  status: Schema.Literals(["running", "blocked", "completed"]),
  updated: Schema.String,
  result: Schema.optional(resultSchema),
  events: Schema.Array(
    Schema.Struct({
      time: Schema.String,
      status: Schema.Literals(["running", "blocked", "completed"]),
      detail: Schema.NonEmptyString,
    }),
  ),
});
export type IssueRun = typeof issueRunSchema.Type;
export type IssueStage = typeof stageSchema.Type;
const now = () => new Date().toISOString();

/** Local work progress; never grants GitHub or backend mutation permissions. */
export class IssueRuns {
  constructor(readonly workflow: Workflow) {}
  list = () =>
    Effect.gen({ self: this }, function* () {
      const fs = yield* FileSystem.FileSystem;
      const folder = resolve(
        this.workflow.factory.storage,
        ".runtime/issue-runs",
      );
      if (!(yield* fs.exists(folder))) return [] as IssueRun[];
      return yield* Effect.forEach(
        (yield* fs.readDirectory(folder)).filter((n) => n.endsWith(".json")),
        (n) => this.read(n.slice(0, -5)),
      );
    });
  read = (id: string) =>
    Effect.gen({ self: this }, function* () {
      const run = yield* readSchema(
        this.workflow.path("issue-runs", id),
        issueRunSchema,
      );
      const { config } = yield* this.workflow.factory.package();
      if (run.id !== id || run.repository !== config.repository)
        return yield* fail("Issue run identity mismatch");
      return run;
    });
  current = (run: IssueRun) =>
    Effect.gen({ self: this }, function* () {
      if (
        run.policy !== (yield* this.workflow.policy()) ||
        run.fingerprint !==
          (yield* this.workflow.snapshot({ kind: "issue", number: run.number }))
            .fingerprint
      )
        return yield* fail(
          "Issue evidence or policy changed; block this run and start a fresh run",
        );
    });
  save = (run: IssueRun) =>
    writeJson(this.workflow.path("issue-runs", run.id), run);
  start = (number: number, stage: IssueStage, statement: string) =>
    Effect.gen({ self: this }, function* () {
      if (!Number.isSafeInteger(number) || number < 1 || !statement.trim())
        return yield* fail(
          "Provide an issue number and actual user instruction",
        );
      if (
        (yield* this.list()).some(
          (r) => r.number === number && r.status === "running",
        )
      )
        return yield* fail(
          "Issue already has a running stage; finish or block it first",
        );
      const scan = yield* this.workflow.scanTarget({ kind: "issue", number });
      const run: IssueRun = {
        id: randomUUID(),
        number,
        repository: scan.repository,
        scan: scan.id,
        policy: scan.policy,
        fingerprint: scan.items[0]!.fingerprint,
        stage,
        status: "running",
        updated: now(),
        events: [{ time: now(), status: "running", detail: statement }],
      };
      yield* this.save(run);
      const { config, skills } = yield* this.workflow.factory.package();
      return {
        ...run,
        skill:
          stage === "verification"
            ? skills.verification
            : config.scan_skills?.issues,
        environment: resolve(
          this.workflow.factory.storage,
          "local/environment.md",
        ),
        note: "Read the skill and environment prerequisites. Issue runs use the user instruction above, not PR gate approvals. This records local work only; backend mutations and GitHub writes require their applicable authorization.",
      };
    });
  transition = (id: string, status: "running" | "blocked", detail: string) =>
    Effect.gen({ self: this }, function* () {
      const run = yield* this.read(id);
      if (
        !detail.trim() ||
        (status === "blocked"
          ? run.status !== "running"
          : run.status !== "blocked")
      )
        return yield* fail("Invalid issue transition or missing reason");
      if (status === "running") {
        if (
          (yield* this.list()).some(
            (r) =>
              r.id !== id && r.number === run.number && r.status === "running",
          )
        )
          return yield* fail("Issue already has a running stage");
        yield* this.current(run);
      }
      const updated: IssueRun = {
        ...run,
        status,
        updated: now(),
        events: [...run.events, { time: now(), status, detail }],
      };
      yield* this.save(updated);
      return updated;
    });
  finish = (id: string, file: string) =>
    Effect.gen({ self: this }, function* () {
      const run = yield* this.read(id);
      if (run.status !== "running")
        return yield* fail("Only a running issue stage can finish");
      const result = yield* readSchema(resolve(file), resultSchema);
      if (!result.evidence.length || result.fingerprint !== run.fingerprint)
        return yield* fail(
          "Result needs evidence and the exact run fingerprint",
        );
      yield* this.current(run);
      const updated: IssueRun = {
        ...run,
        status: "completed",
        updated: now(),
        result,
        events: [
          ...run.events,
          { time: now(), status: "completed", detail: result.summary },
        ],
      };
      yield* this.save(updated);
      return updated;
    });
}
