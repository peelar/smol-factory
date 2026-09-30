# smol-factory configuration

`.smol-factory/smol-factory.json` is the sole shared configuration. `smol init` creates it and the
repository skills as a draft. Paths are relative to the repository root and may
not escape it, including through symlinks. `smol validate` checks the schema and
required files. The engine fingerprints config, context, and all stage skills.
Changing those invalidates existing assessments and approvals.

Required fields: `version: 1`, `slug`, `name`, GitHub `repository` (`owner/name`),
positive `scan_limit`, `core_team_reference`, `core_members`, `context`, `skills`
(classification/review/verification), and `evidence` (`trusted_documents` paths and
`omit_suffixes`). In this prototype `require_approval` is exactly classification,
review, verification; `github_writes` defaults to false and can be `"approval_required"`; `repair_code` remains false. Configuration is editable and needs no setup acceptance.

Scanning excludes PR authors GitHub marks as `MEMBER` or `OWNER`, plus usernames
in `core_members` (case-insensitive). Keep `core_members` for accounts that
GitHub does not identify as organization members. The author appears in local
assessment reports and the terminal view.

Keep judgment in Markdown skills: product fit in classification, non-executing
code assessment in review, actual commands/services/scenarios in verification.
`smol inspect` records revision, sources, bounded history and limitations in
`.smol-factory/.runtime/onboarding/evidence.json`. Missing or sampled evidence must not
be reported as complete. HEAD fallback is not a confirmed default branch.

## Personal runtime

Use ignored `.smol-factory/local/config.json`:

```json
{
  "adapter": ["bun", "/path/to/smol-factory/scripts/codex-adapter.ts"],
  "models": {
    "classification": { "model": "default" },
    "review": { "model": "default" },
    "verification": { "model": "default" }
  },
  "max_concurrent": 2,
  "stage_limits": { "verification": 1 }
}
```

Init writes Codex defaults while preserving existing personal choices. `default` uses the installed Codex CLI's selected model. You can change each stage's model and reasoning in this ignored file.
The TUI installs the skill and hands setup to a coding agent that discovers `.agents/skills`. The optional `smol analyze` command uses the installed, authenticated Codex CLI (`codex exec` in read-only mode) to produce a schema-validated JSON document and a Markdown report in `.smol-factory/.runtime/onboarding/<run-id>/`. The schema requires repository identity, summary, cited observations or inferences for scope, architecture, classification, review and verification, plus unresolved questions. These documents are proposals; they do not change configuration or policy. For execution, use an
adapter implementing the following contract. The bundled Codex adapter uses read-only classification and an isolated frozen-revision worktree for approved review or verification. Doctor checks executable availability
but never invokes it. Put service addresses,
ports, credential environment-variable names and test-environment permissions in
`.smol-factory/local/environment.md`; never store secret values in config or prompts.

The engine executes `ADAPTER ACTION REQUEST_JSON` as argv without a shell. ACTION
is `classify` or `launch`. The request includes `factory_root`, `storage_root`,
repository identity, `stage`, selected `model` settings, and evidence/prompt paths.

- `classify`: run one batch conversation using `prompt_path`; write results at
  `output_path` matching the bundled `schema_path`. No PR worktrees or code execution.
- `launch`: create/reuse an isolated workspace for the frozen PR, start/resume its
  conversation, and return JSON thread handles (`agent`, `workspace`, `pane`,
  `worktree` as applicable). Preserve opaque resume metadata across stages.

Fail clearly for unavailable capabilities. Record handles before submitting work
so partial launch failures can be inspected without launching duplicates. Model
configuration, adapter availability and verification service readiness are separate.
The Codex adapter records each result without advancing approval. Its local checkpoint records launch state and session ID; inspect it before retrying a failed stage.

The mutation lock is `.smol-factory/.runtime/factory.lock.d`. Normal completion,
failure and interruption release it. After a forced kill, inspect its owner PID
and retained stage/thread state before manually removing a stale lock. State files
are replaced atomically. TUI confirmations additionally require the displayed
assessment fingerprint to still match under that lock. Upstream revision checks
remain in the shared engine. Configuration changes never advance a PR gate.

During wizard analysis, Codex JSON events provide live activity, completed item counts and session identity. The UI shows elapsed time and time since the last event. Sessions persist in Codex history; the session ID can be opened after the run with `codex resume ID`. Progress uses event metadata only, never raw commands or agent output.

## Approved GitHub operations

`github_writes` accepts `false` (disabled) or `"approval_required"`. The latter permits only exact approved proposals through `smol apply`; it is not approval. Optional `scan_skills.issues` and `scan_skills.prs` point to repository-specific skill files. See [the workflow contract](docs/issue-workflow.md).
