---
name: scan-issues
description: Scan or resume issues in this repository's smol-factory, following its configured intake, stages, references and GitHub permissions. Also handles a specified issue.
---

# Scan issues

Find this repository's root. Read its agent instructions and
`.smol-factory/policy.ts`, `.smol-factory/policy.types.ts` and the configured
`context`. A missing or unaccepted policy needs onboarding;
stop and ask the user to read the smol-factory bootstrap skill from its source.
Do not invent policy or install a CLI.

Read the configured `operations` and `records` documents. Use `intake.issues`,
`workflows.issues`, worker limits, requirements, labels and GitHub permissions.
Read every reference assigned to each stage before performing it. Typed policy
defines permission; Markdown explains assessment. Policy is guidance, not a
tool-access sandbox.

Use the SQLite store and migration/checkpoint protocol in the configured records
document; preserve companion understanding and evidence files.

Resume actionable item memory first, then admit new open issues within the batch
limit. Exclude PRs from issue queries. Apply explicit request filters and policy
exclusions. For a specified issue, use the same process with one item. Read full
discussions, relevant history and prior understanding; do not infer completeness
from an intake list or status label.

Follow configured stages and transitions, not a fixed sequence. The default is
validate → classify → verify when needed → ready to be worked on. Record progress
and evidence locally as it happens. Unknown reproduction need cannot skip
verification. Freeze actual software versions and environment before verifying.
Do not execute code outside permitted verification or implement fixes in a scan.

Coordinate workers within total/per-role limits; choose available models from
configured preferences, or work serially. Workers investigate and return separate
reports. Only the coordinator updates item records and performs public actions.

All GitHub writes start approval-required, including labels and comments. Present
exact actions and text; obtain actual user approval or match a specific accepted
grant before using `gh` or a connector to write. Record receipts and recheck
freshness. A local result is not a published label, and ready does not mean fixed
or closed. Keep full evidence locally and report findings, blockers and pending
proposals concisely.
