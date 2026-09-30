# Agent-led issue and PR scans

The agent reads repository-specific skills, investigates, and presents findings.
smol stores evidence, proposals, explicit approvals, and operation receipts. The
TUI's **Tab** key switches between Issues and PRs. Issue details show saved suggested
actions; approval currently happens through the agent/CLI. No scan invokes a model
or writes to GitHub. The older `classify` adapter
remains optional.

## Setup

Install `setup-scan-issues` and `setup-scan-prs` with:

```sh
smol skill install --name setup-scan-issues
smol skill install --name setup-scan-prs
```

Ask the agent to use these setup skills. They create customized
`.agents/skills/scan-issues/SKILL.md` and `scan-prs/SKILL.md`, registered under
`scan_skills.issues` and `scan_skills.prs` in the repository configuration.
Keep `github_writes: false` until approved operations are desired; use
`"approval_required"` to enable the capability. This setting never grants approval.

## Collect, assess, propose, approve, apply

```sh
smol scan issues --search 'created:2019-01-01..2023-12-31'
smol scan prs
smol assess ASSESSMENT_SCAN_ID --file results.json
smol propose SCAN_ID --file proposal.json
smol proposals PROPOSAL_ID
smol approve-proposal PROPOSAL_ID --entries retain-4165 --statement 'Put 4165 in verify'
smol apply PROPOSAL_ID
```

Scans are bounded by `scan_limit`; do not describe them as exhaustive when the
limit is reached. Refine searches or explicitly change that limit. PR scans retain
the existing eligibility policy and return an `assessmentScan` ID; its packets
contain diffs and trusted base documents. Use that ID with `assess` and the existing
classification result schema (`scripts/classification.schema.json`). `propose`
uses the outer scan ID. Agent findings do not approve a gate.

Example proposal input (fingerprint comes from the scan):

```json
{
  "entries": [
    {
      "id": "retain-4165",
      "target": { "kind": "issue", "number": 4165 },
      "fingerprint": "SNAPSHOT_FINGERPRINT",
      "summary": "Current code still limits the warehouse query to 50; reproduction pending.",
      "evidence": [
        "src/products/components/ProductVariants/ProductVariants.tsx at COMMIT"
      ],
      "actions": [{ "type": "labels", "add": ["verify"], "remove": ["triage"] }]
    }
  ]
}
```

Each entry is an approval unit. Split comments, labels, and closure into separate
entries if they need separate approval. Multiple entries may target the same item.
All exact text must be presented before approval. Edit a proposal by creating a
new one, never by modifying stored JSON. Public labels/comments must not contain
factory branding. Labels are repository policy, not built-in state transitions.

Supported actions:

- `labels`: `add` and `remove` string arrays; preserve unrelated labels.
- `comment`: exact `body` string, sent using a JSON input file.
- `close`: `reason` is `completed` or `not_planned`; PR closure only accepts
  `not_planned` and never merges.
- `reopen`: no extra fields.
- `create_label`: `name`, six-digit hex `color`, `description`; does not overwrite
  existing labels. Include a separate approved entry before using missing labels.
- `advance`: PR assessment `gate`. smol binds the recorded assessment fingerprint
  and result digest when creating the proposal. Approves only a passing, unchanged
  assessment; does not launch the next stage.

`smol status` includes proposals. Receipts distinguish pending, started, and done
operations. Applying again skips completed operations. Approval is bound to the
proposal digest, repository policy, and target snapshots. PR head/base or issue
source revision changes, new comments, state changes, and changed labels require
fresh assessment/proposals. Local state is not a tamper-proof authorization store:
the agent must record genuine user instructions, and stronger enforcement needs
tool restrictions preventing direct GitHub writes or state-file manipulation.

GitHub writes are not transactional. Each action is checked immediately before
execution; completed writes remain completed if a later action fails. An interrupted
or failed write with an uncertain outcome is never replayed automatically. Inspect
GitHub, create a fresh scan, and propose only remaining work for approval. No hidden
comment markers or branding are published. GitHub can change between a check and a
write; smol cannot offer an atomic compare-and-swap across GitHub operations.

For review and verification in the current conversation, `smol start NUMBER GATE`
checks the preceding approval, reserves execution capacity, and returns the stage
prompt and frozen assessment fingerprint without launching an adapter. Follow that
prompt, then submit with `smol finish NUMBER GATE RESULT_JSON`. `smol launch` is the
optional adapter equivalent. Existing stage approval gates still apply.

## Persisted issue work

Agent work must update smol through the CLI as it happens. PRs retain their
existing `assess`, `start`, `finish`, and approval commands. Issues use:

```sh
smol issue start 6554 verification --statement 'Verify issue 6554 through smol-factory'
smol issue block RUN_ID --reason 'Need permission to mutate the shared test data'
smol issue resume RUN_ID --reason 'Maintainer authorized the named test fixtures'
smol issue finish RUN_ID --file result.json
```

`start` also accepts `triage`. It collects the specific issue, freezes its evidence
and repository policy, records the user instruction, and returns the applicable
skill and local environment path. It does not run a model, read credentials, or
change GitHub. A running issue cannot start a second concurrent stage. A blocked
run can be resumed only against unchanged evidence, or replaced with a fresh run.
History remains in `.runtime/issue-runs/`; `smol status` and the TUI display it.

Result file:

```json
{
  "fingerprint": "EXACT_RUN_FINGERPRINT",
  "verdict": "confirmed",
  "summary": "The draft-orders query fails with the missing listing.",
  "evidence": [
    "Local report path with source/backend versions and reproduction results"
  ]
}
```

Verdicts: `confirmed`, `already_fixed`, `not_reproduced`, `needs_verification`,
`out_of_scope`. Evidence must be nonempty. Record the actual checked source/backend
versions in the evidence; the frozen GitHub revision is not proof of the deployed
version. Never include credentials. A completed run is a completed assessment,
not authorization to implement, publish, or close. Proposal approvals and receipts
remain separate and visible in the TUI. State changes are local and immediate;
GitHub labels/comments change only through approved proposals.
