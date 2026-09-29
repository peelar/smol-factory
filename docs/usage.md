# smol-factory usage

Local PR assessment for agent harnesses, with a terminal view for maintainer
decisions. The harness coordinates work; smol retains evidence, checks revisions,
and enforces approval gates. Built with TypeScript and Effect. GitHub is read-only;
classification, review, and verification each require an explicit maintainer decision.

## Install

With [Bun](https://bun.sh) installed:

```sh
bun install -g github:peelar/smol-factory
```

If your shell cannot find `smol`, add Bun's global bin directory (`bun pm bin -g`)
to your `PATH`. GitHub access needs Git and an authenticated GitHub CLI; the bundled
adapter also needs an installed, authenticated Codex CLI.

Onboarding installs the repository skill. For global availability, run
`smol skill install --global`. This writes
`~/.agents/skills/smol-factory/SKILL.md`, preserving existing customizations.
Use an agent that discovers `.agents/skills`; refresh discovery or start a new
session after installation. No registry publication needed.

## Start inside your repository

```sh
cd /path/to/your-repository
smol
```

Unconfigured repositories open onboarding. Install the repository skill there,
then open a coding agent that discovers `.agents/skills` in the same repository:
**“Use the smol-factory skill to set up this repository.”** The agent initializes
missing configuration, inspects the repository, drafts policy, validates it, and
checks readiness. Refresh the TUI afterward. Configured repositories open the PR
queue without setup acceptance.

Or use the CLI and skill directly:

```sh
smol init                              # infer GitHub identity from origin
smol inspect                           # committed source + bounded PR history
smol validate
smol doctor
```

For ambiguous identity, use `smol init --repository owner/repository`.
Use `smol inspect --local-only` without GitHub, or `--history-limit 1..30` to adjust
the history sample (default 12 PRs). Use `--root PATH` from elsewhere; commands
also find the root from nested directories. Repeated init preserves configuration.

The agent tailors editable classification, review and verification policy to
repository evidence. Its summary explains smol-factory, this repository's
assessment rules, and the next action: resolve a blocker or scan and classify PRs.
Uncertain policy stays unresolved; historical outcomes do not establish exclusions.

Doctor checks configuration, runtime settings and GitHub access without executing
repository code or the adapter. Verification services need repository-specific
configuration. Setup neither starts a scan nor approves PR gates.

## Operate

`smol` or `smol tui` opens assessments, with pending approvals and blocked findings
first. The overview shows the next decision, assessment, findings and decisive
evidence. `[a]` inspects a maintainer decision; `[2]` shows full stage evidence.
Enter confirms the named action; Escape cancels. Artifacts holds runtime models
and paths.

Shortcuts under `[?]`: `[o]` opens setup, `[s]` proposes a scan, `[c]` proposes
classification of the latest scan, and `[x]` launches an approved stage.
Approval and launch are separate. Blocked outcomes require a reason through the
CLI. In a source checkout, `bun run tui:demo` runs a nonmutating demo.

Agents use the CLI:

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

`smol status` returns the version 1 [assessment contract](../assessment-contract.md):
full findings, approvals, revision fingerprints, counts, and the next actor/action.
CLI, TUI and Markdown reports share this assessment projection. Status reads local
files without checking upstream freshness or runtime capacity.

Init saves editable Codex runtime defaults in ignored personal config; see
[configuration.md](../configuration.md). Findings never grant approval. Maintainers
can override with `decide NUMBER GATE --reason '...'`, then separately approve.
`finish NUMBER GATE RESULT_JSON` records a running stage's result.

Reports and the TUI Overview summarize each stage's outcome, reason, limits,
decisive evidence and pending action. Full findings and evidence follow Markdown
summaries and appear in the TUI Evidence tab; history preserves prior events. Agent
summaries target 80–150 words, except for complex changes.

All transitions check revisions. Nothing merges, posts, repairs code or advances
automatically. Retain workspaces until explicit cleanup.

## Repository files

- `.smol-factory/smol-factory.json`: versioned repository identity, scan settings and skill paths.
- `.smol-factory/context.md` and `.smol-factory/skills/`: maintained repository policy.
- `.smol-factory/local/`: ignored adapter, models and personal environment settings.
- `.smol-factory/.runtime/`: ignored state, evidence, prompts, locks and thread handles.
- `.smol-factory/assessments/` and `.smol-factory/scans/`: ignored assessment reports.
- `.agents/skills/smol-factory/`: repository skill installed with permission during onboarding or with `smol skill install`.

Personal files and earlier prototype artifacts are neither migrated nor deleted.

## Development

Clone the repository and use the Bun version in [`.bun-version`](../.bun-version):

```sh
git clone https://github.com/peelar/smol-factory.git
cd smol-factory
bun install --frozen-lockfile
bun run smol --help
bun run tui:demo
bun run test
bun run typecheck
```

`bun run smol validate` checks assessment policy, not the build. This checkout
ships no `.smol-factory/` configuration. Validate an initialized target with
`bun run smol --root /path/to/your-repository validate`.

Source installation, CLI, skill installation and tests were checked locally on
macOS ARM64 with Bun 1.4.2. Linux awaits its first hosted CI run; Windows is unverified.

Onboarding, classification and review never execute target-repository code.
Tests use isolated fixtures and mocked GitHub calls. Terminal tests capture
frames in ignored `.runtime/tui-preview/`.
