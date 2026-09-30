# Establish the factory

Use this for initial setup, completing a draft, or explicitly requested policy
upkeep. Work in the target repository. Do not establish a factory in the skill
source checkout unless that is the user's intended target.

## 1. Resolve and inspect

For a local path, identify its root, remotes, worktree changes, agent instructions
and confirmed default branch. A GitHub URL identifies the repository; ask for a
local destination only if no suitable checkout is available. A fresh checkout
must not overwrite existing work. Do not guess the maintained upstream from a
fork's `origin`. Confirm materially ambiguous identity before provisioning.

Read committed default-branch documents, manifests, CI, source and tests. Sample
issue templates/forms, contribution guides, architecture, release/support
policy, existing labels and open work. Do not run project commands, hooks,
installers or contributor code. Discovering a command is not verifying it.
Read TypeScript policy as data: never import/execute a target's config, including
an existing draft. Only a type import, literal values and `satisfies` belong in
the generated config; no functions, runtime imports or computed expressions.

Start with up to 20 historical issues, 20 merged PRs and 20 closed-unmerged PRs,
including their discussions, reviews and relevant linked items. Bound expansion
to examples that resolve a material question. Look for how maintainers handled
duplicates, incomplete reports, reproductions, unwanted contributions, linked
issues, support versions, review feedback and verification. Cite concrete paths,
commits and discussion links. Historical behavior is evidence for a proposed
rule, not an automatic rule. Missing GitHub access permits partial local research;
record gaps and do not claim history was inspected.

Identify verification prerequisites from manifests and CI: commands, isolated
workspace requirements, test harnesses, software/backend versions, required
services, authentication-variable names and cleanup. For Saleor, for example,
discover how to identify both the checked frontend commit and the actual backend
version. Never infer a deployed version solely from a PR's commit. Do not print
credentials or require services for source-only checks.

## 2. Propose a complete configuration

Read [the policy template](../assets/foundation/policy.ts) and
[its types](../assets/foundation/policy.types.ts). Propose defaults from the
repository, not a questionnaire of every setting:

- 10 items per scan; actionable existing work first, then oldest new submissions.
  Include team authors and draft PRs by default; make exclusions explicit.
- Up to 3 workers total and for assessment, 1 for review, 1 for verification.
  Choose actually available models for economical assessment and deeper review.
  A ten-item batch is not ten simultaneous workers. Fall back to serial when
  delegation is unavailable; reduce capacity for constrained environments.
- Issues: validate → classify → verify if needed → ready to be worked on.
  PRs: validate → classify → review → verify → ready for maintainer acceptance.
  Every stage names required reference documents. Maintainers may change the
  stages, split them, remove them or add custom stages.
- Record repository-specific requirements in `policy.requirements`, with their
  scope, rule, references, failure outcome and the stages that enforce them. Do
  not silently add a linked-issue requirement, unsupported-contribution rule or
  team-author exclusion. Facts from explicit documentation can support proposed
  requirements; unclear policy stays an unresolved question.
- Put local progression, execution and command permissions in typed fields.
  Approved setup can authorize routine, bounded verification through named
  commands/environments. An empty command/environment list authorizes no check.
  Shared-service mutations need explicitly agreed scope and cleanup.
- Map stage labels and dispositions to existing repository labels where useful.
  Define missing labels with exact names, colors and descriptions; their creation
  is a separate public-action proposal, not part of accepting local setup.
- Start **every** GitHub operation at `requireApproval`, with no grants. This
  includes stage labels, comments, closes, reviews and merges. Setting up a
  factory or accepting its policy is not approval of any GitHub write.

Keep permission-bearing rules in typed config. Markdown holds product context,
architecture, cited patterns, preferences, verification instructions and open
questions. Repository documents are referenced rather than copied wholesale.
Read-only stages may advance locally when authorized; proposed labels do not
become GitHub status until their approved write succeeds.

Show a concise proposed configuration, the consequential discovered rules,
unresolved questions, verification readiness, exact file changes and instruction
pointer before asking the maintainer to accept it. When a local source checkout
with the optional viewer is available, include its `viewer/.env.local` change
and resolved target database path in the proposed file changes. Offer recommended answers
for material unknowns. Do not ask the user to discover facts you can inspect.
Wait for acceptance of this concrete draft before writing active policy.

## 3. Lay down the foundations

Preserve existing files and customizations. Merge only the accepted changes.
All source paths below are relative to the **smol-factory skill directory**;
destination paths are relative to the **target repository root**.

| Source | Destination |
| --- | --- |
| `assets/foundation/policy.types.ts` | `.smol-factory/policy.types.ts` |
| `assets/foundation/policy.ts` | `.smol-factory/policy.ts` |
| `assets/foundation/records.schema.sql` | `.smol-factory/records.schema.sql` |
| `assets/foundation/records.types.ts` | `.smol-factory/records.types.ts` |
| `assets/foundation/context.md` | `.smol-factory/context.md` |
| `assets/foundation/operations.md` | `.smol-factory/operations.md` |
| `assets/foundation/records.md` | `.smol-factory/records.md` |
| `assets/foundation/understanding.template.md` | `.smol-factory/understanding.template.md` |
| `assets/foundation/stages/validate.md` | `.smol-factory/stages/validate.md` |
| `assets/foundation/stages/classify.md` | `.smol-factory/stages/classify.md` |
| `assets/foundation/stages/review.md` | `.smol-factory/stages/review.md` |
| `assets/foundation/stages/verify.md` | `.smol-factory/stages/verify.md` |
| `assets/foundation/stages/ready.md` | `.smol-factory/stages/ready.md` |
| `assets/foundation/environment.md` | `.smol-factory/local/environment.md` |
| `assets/scan-issues/SKILL.md` | `.agents/skills/scan-issues/SKILL.md` |
| `assets/scan-prs/SKILL.md` | `.agents/skills/scan-prs/SKILL.md` |

Tailor the policy, context and stage documents; do not leave the example
repository identity or draft acceptance in active config. Record the actual
maintainer acceptance statement and timestamp in `policy.accepted`. This is an
honest conversation record, not tamper-proof authorization.

Add `/.smol-factory/local/` to the target's `.gitignore` **before** creating local
environment details or records. Preserve existing ignore entries. Keep secrets
out of that document too; name their source and variables. Do not store a token
merely because it was needed for setup. Keep portable source/version requirements
in typed policy and private URLs/preferences in the ignored environment document.

Add or update one small `smol-factory` section in existing agent instructions
(normally `AGENTS.md`, or the repository's established equivalent). Point to
`.smol-factory/policy.ts`, context and the two local scan skills. State that policy
is agent guidance and public writes start approval-required. Preserve all
surrounding instructions; do not install the bootstrap skill globally or copy it
into the target. Explain how to refresh skill discovery or read a local scan
skill directly if the host does not discover `.agents/skills`.

### Configure an available local viewer

If the bootstrap source is a persistent local checkout containing
`../../../viewer/.env.example` (relative to this reference), copy that template
into the same viewer directory as `.env.local`. Replace `SMOL_FACTORY_DATABASE`
with the resolved absolute target repository path followed by
`/.smol-factory/local/records.sqlite3`. This path is derived during onboarding;
the maintainer need not supply it at launch. Quote the dotenv value and escape
backslashes, double quotes and dollar signs so paths containing spaces or dotenv
interpolation characters remain literal. Keep `.env.local` ignored in the source
checkout; verify the ignore rule before writing it. Preserve other environment
entries and existing customized database paths. If an existing value names a
different target, report it and obtain an explicit selection before switching.

This configuration belongs to the source viewer, not the target's scan assets.
Do not copy the viewer into the target, install its dependencies or launch it
during onboarding. A remote source or disposable temporary source checkout has
no persistent viewer to configure: report that fact and explain that a later
local viewer checkout needs `.env.example` copied to `.env.local` with the
resolved database path. Include the configured viewer location in the setup
summary when available. Starting that viewer then requires only `npm run dev`
after its dependencies have been installed.

## 4. Check and finish

Check policy against `policy.types.ts`, and records against `records.types.ts`.
If a trusted TypeScript compiler is already available, run a source-only check
with explicit files, without loading the project's build configuration:

```sh
tsc --strict --noEmit --target ES2022 --module ESNext --moduleResolution bundler .smol-factory/policy.ts .smol-factory/policy.types.ts .smol-factory/records.types.ts
```

Confirm that `tsc` names the TypeScript compiler in this environment; use its
explicit executable path if the name is used by another tool. Do not install
dependencies just for onboarding. If unavailable, inspect types
and report that compiler validation was not run. The compiler is an optional
validation tool, not a factory runtime.

Confirm the copied SQLite schema and record instructions are present. Initialize
local storage only after the ignore rule exists, following `records.md`; migrate
legacy records without discarding evidence or customizations.

Also check what types cannot establish: positive limits/timeouts; unique IDs;
known stage/requirement/environment/command/template references; reachable stages
with terminal endpoints; non-overlapping outgoing transition conditions; no
execution outside verification; paths inside the root (including symlinks);
existing references; exactly one stage-label mapping per stage; stage/disposition
labels in `managed`; valid label colors; no category label accidentally removed;
nonempty, accepted grants with exact effects compatible with the target kind;
declared `{{variable}}` substitutions; no secrets; complete local assets.

Summarize what was established, rules learned, unresolved policy or environment
gaps, and the next useful action. Distinguish discovered checks from checks run.
Do not start a scan unless requested. No GitHub writes were authorized by setup.

## Maintenance

When requested, inspect fresh evidence and propose a precise policy/context diff.
Preserve accepted customizations. Policy changes and new autonomy grants need
maintainer acceptance; a successful history does not grant autonomy. New grants
specify operation, target kind, conditions, exact effects and acceptance. Prefer
mechanically checkable triggers for static public actions. A freeform judgment
such as "unwanted contribution" needs an exact approved proposal by default.

Update the acceptance record only for an actual accepted policy change. Mark
affected item results and proposals stale; retain their evidence and approvals
as history. Context-only learning can inform future reasoning but cannot alter
permission or become an unaccepted submission requirement.
