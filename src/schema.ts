import { Schema } from "effect";

const mutableStruct = <F extends Schema.Struct.Fields>(fields: F) =>
  Schema.Struct(
    Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [
        key,
        Schema.mutableKey(value),
      ]),
    ) as { [K in keyof F]: Schema.mutableKey<F[K]> },
  );

export const gates = ["classification", "review", "verification"] as const;
export type Gate = (typeof gates)[number];
export const positiveInt = Schema.Int.check(Schema.isGreaterThan(0));
const strings = Schema.mutable(Schema.Array(Schema.String));
export const resultSchema = mutableStruct({
  fingerprint: Schema.String,
  verdict: Schema.Literals(["pass", "needs_changes", "needs_decision"]),
  summary: Schema.String,
  findings: strings,
  evidence: strings,
});
export type Result = typeof resultSchema.Type;
export const threadSchema = Schema.StructWithRest(
  Schema.Struct({
    agent: Schema.optional(Schema.String),
    worktree: Schema.optional(Schema.String),
    workspace: Schema.optional(Schema.String),
    pane: Schema.optional(Schema.String),
    port: Schema.optional(Schema.NullOr(Schema.Number)),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);
const approvalSchema = Schema.Struct({
  fingerprint: Schema.String,
  statement: Schema.String,
  time: Schema.String,
});
export const prSchema = mutableStruct({
  number: positiveInt,
  title: Schema.String,
  author: Schema.optional(Schema.String),
  head: Schema.String,
  base: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
  repository: Schema.optional(Schema.String),
  discussion_hash: Schema.optional(Schema.String),
  fingerprint: Schema.String,
  status: Schema.String,
  packet: Schema.optional(Schema.String),
  results: mutableStruct({
    classification: Schema.optional(resultSchema),
    review: Schema.optional(resultSchema),
    verification: Schema.optional(resultSchema),
  }),
  approvals: mutableStruct({
    classification: Schema.optional(approvalSchema),
    review: Schema.optional(approvalSchema),
    verification: Schema.optional(approvalSchema),
  }),
  history: Schema.mutable(
    Schema.Array(
      Schema.Struct({
        time: Schema.String,
        event: Schema.String,
        text: Schema.String,
      }),
    ),
  ),
  thread: Schema.optional(Schema.NullOr(threadSchema)),
});
export type PullRequest = typeof prSchema.Type;
export const manifestSchema = Schema.Struct({
  id: Schema.String,
  created: Schema.String,
  prs: Schema.mutable(Schema.Array(positiveInt)),
  pending: Schema.optional(Schema.mutable(Schema.Array(positiveInt))),
});
export type Manifest = typeof manifestSchema.Type;
export const repositorySchema = Schema.Struct({
  version: Schema.Literal(1),
  slug: Schema.String.check(Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)),
  name: Schema.String.check(Schema.isPattern(/\S/)),
  repository: Schema.String.check(Schema.isPattern(/^[^/]+\/[^/]+$/)),
  scan_limit: positiveInt,
  core_team_reference: Schema.String,
  core_members: strings,
  require_approval: Schema.Tuple([
    Schema.Literal("classification"),
    Schema.Literal("review"),
    Schema.Literal("verification"),
  ]),
  github_writes: Schema.Literal(false),
  repair_code: Schema.Literal(false),
  context: Schema.String,
  skills: Schema.Struct({
    classification: Schema.String,
    review: Schema.String,
    verification: Schema.String,
  }),
  evidence: Schema.Struct({
    trusted_documents: Schema.Array(Schema.NonEmptyString),
    omit_suffixes: Schema.Array(Schema.NonEmptyString),
  }),
});
export const localSchema = Schema.Struct({
  models: Schema.optional(
    Schema.Record(
      Schema.String,
      Schema.Struct({
        model: Schema.NonEmptyString,
        reasoning: Schema.optional(Schema.String),
      }),
    ),
  ),
  adapter: Schema.optional(Schema.Array(Schema.NonEmptyString)),
  max_concurrent: Schema.optional(positiveInt),
  stage_limits: Schema.optional(Schema.Record(Schema.String, positiveInt)),
});
const githubPrFields = {
  number: positiveInt,
  state: Schema.String,
  draft: Schema.Boolean,
  author_association: Schema.optional(Schema.String),
  user: Schema.NullOr(
    Schema.Struct({ login: Schema.String, type: Schema.String }),
  ),
  head: Schema.Struct({ sha: Schema.String }),
  base: Schema.Struct({ sha: Schema.String }),
  title: Schema.String,
  body: Schema.NullOr(Schema.String),
  html_url: Schema.String,
};
export const githubPrListSchema = Schema.Struct(githubPrFields);
export const githubPrSchema = Schema.Struct({
  ...githubPrFields,
  changed_files: Schema.Int,
});
export type GithubPr = typeof githubPrSchema.Type;
export const discussionSchema = Schema.Struct({
  user: Schema.Struct({ login: Schema.String }),
  body: Schema.optional(Schema.NullOr(Schema.String)),
  state: Schema.optional(Schema.NullOr(Schema.String)),
  html_url: Schema.optional(Schema.String),
});
export type Discussion = typeof discussionSchema.Type;
export const fileSchema = Schema.Struct({
  filename: Schema.String,
  status: Schema.String,
  previous_filename: Schema.optional(Schema.String),
  additions: Schema.Int,
  deletions: Schema.Int,
  patch: Schema.optional(Schema.String),
});
