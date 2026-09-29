# smol-factory

A local PR assessment tool for agent harnesses, with a terminal view for
maintainer decisions. The harness coordinates work; smol retains evidence,
checks revisions, and enforces approval gates. Built with TypeScript and Effect.
GitHub access is read-only. Classification, review, and verification each stop
for an explicit maintainer decision.

## Install the local prototype

From this source checkout (Bun required):

```sh
bun install --frozen-lockfile
mkdir -p ~/.local/bin
ln -s "$PWD/scripts/smol.ts" ~/.local/bin/smol
smol skill install --global
```

Ensure `~/.local/bin` is on your `PATH`. The symlink exposes the executable from
this checkout; `bun link` alone only registers the package for linking into other
projects. Skill installation writes
`~/.agents/skills/smol-factory/SKILL.md` and preserves customized existing skills.
Use an agent that discovers `.agents/skills`; refresh its skill discovery or start
an agent session after installation. No registry publication is required.

For development, `bun run smol --help` runs the same CLI without linking.
A distributable local archive can be produced with `bun pm pack`; it includes
code, UI, schemas and the skill, not this checkout's repository policy or state.

## Start inside your repository

```sh
cd /path/to/your-repository
smol
```

The terminal opens in a dedicated onboarding state for an unconfigured repository.
Install the repository skill there, then open a coding agent that discovers
`.agents/skills` in the same repository and ask:
**“Use the smol-factory skill to set up this repository.”** The agent checks whether
`.smol-factory/smol-factory.json` exists, initializes it if needed, inspects the repository, drafts
policy, validates it, and checks readiness. Return to the TUI and refresh.
Configured repositories can open the PR queue without setup acceptance.

Alternatively, use the CLI and skill directly:

```sh
smol init                              # infer GitHub identity from origin
smol inspect                           # committed source + bounded PR history
smol validate
smol doctor
```

If identity is ambiguous, use `smol init --repository owner/repository`.
Use `smol inspect --local-only` when GitHub is unavailable, or
`--history-limit 1..30` to change the sample budget (default 12 PRs).
Use `--root PATH` from elsewhere. Commands also discover the root from nested
repository directories. Running init twice preserves existing configuration.

Init creates editable configuration. The agent tailors classification, review and
verification to repository evidence, then runs `smol validate` and `smol doctor`.
No setup acceptance step. Its brief summary explains what smol-factory does, how
it will assess this repo, and the next action: resolve a blocker or scan and classify PRs.
Uncertain policy stays unresolved; historical outcomes do not establish exclusions.

Doctor checks configuration, runtime settings and GitHub access without executing
repository code or the adapter. Verification services still need repository-specific
configuration. Setup does not start a scan or approve any PR gate.

## Operate

`smol` or `smol tui` opens the assessment view. Pending approvals and blocked
findings sort first. The overview leads with the next decision, the relevant
assessment, findings and decisive evidence. `[a]` inspects a maintainer decision;
`[2]` shows full evidence across stages. Enter confirms the named action;
Escape cancels. Runtime models and paths live in Artifacts.

Execution shortcuts remain under `[?]`: `[o]` opens setup, `[s]` proposes a scan,
`[c]` proposes classification of the latest scan, and `[x]` launches an already
approved stage. Approval and launch remain separate.
Blocked outcomes require a reason through the CLI. The demo remains nonmutating:
`bun run tui:demo`.

Agents use the same operations through the CLI:

```sh
smol scan
smol classify RUN_ID
smol status
smol approve NUMBER classification --statement 'Review this PR'
smol launch NUMBER review
smol approve NUMBER review --statement 'Verify this PR'
smol launch NUMBER verification
smol approve NUMBER verification --statement 'Accept these findings'
```

`smol status` returns the version 1 [assessment contract](assessment-contract.md).
It includes full findings, approval records, revision fingerprints, counts, and
an explicit next actor/action. The CLI, terminal view and Markdown reports use
the same assessment projection. Status reads local files; it does not verify
upstream freshness or runtime capacity.

Init saves Codex runtime defaults; they can be changed in the ignored personal config. See
[configuration.md](configuration.md). Findings never grant approval. A maintainer
can record an override with `decide NUMBER GATE --reason '...'`, then separately
approve. `finish NUMBER GATE RESULT_JSON` records a running stage result.
Assessment reports and the TUI Overview lead with compact summaries for each
stage: outcome, reason and limits, decisive evidence, and the pending action.
Full findings and evidence remain available below the Markdown summaries and in
the TUI Evidence tab; history preserves prior events. Agent summaries target
80–150 words, with exceptions for complex changes.

Revision checks apply to all transitions. Nothing merges, posts, repairs code,
or automatically advances the next stage. Retain workspaces until explicit cleanup.

## Repository files

- `.smol-factory/smol-factory.json`: versioned repository identity, scan settings and skill paths.
- `.smol-factory/context.md` and `.smol-factory/skills/`: maintained repository policy.
- `.smol-factory/local/`: ignored adapter, models and personal environment settings.
- `.smol-factory/.runtime/`: ignored state, evidence, prompts, locks and thread handles.
- `.smol-factory/assessments/` and `.smol-factory/scans/`: ignored assessment reports.
- `.agents/skills/smol-factory/`: repository skill installed with your permission during onboarding, or with `smol skill install`.

Personal files and artifacts from earlier prototypes are not migrated or deleted.

## Development

```sh
bun run test
bun run typecheck
bun run smol validate
```

No target-repository code executes during onboarding, classification or review.
Tests use isolated fixtures and mocked GitHub calls. Terminal rendering tests
capture frames under ignored `.runtime/tui-preview/`.
