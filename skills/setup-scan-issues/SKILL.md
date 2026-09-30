---
name: setup-scan-issues
description: Build or update this repository's scan-issues skill for agent-led assessment with smol.
---

Read the repository AGENTS.md, .smol-factory/context.md, configuration, and relevant contribution policy. Inspect recent issue history read-only if needed. Historical outcomes are evidence, not policy.

Create or update `.agents/skills/scan-issues/SKILL.md`, preserving maintainer customizations. Register it as `scan_skills.issues` in `.smol-factory/smol-factory.json`. This is a repository-specific skill, not a copy of a universal policy. Include:

- Scope and scan selection, including configured limits and explicit date filters.
- Repository-specific classification, evidence requirements, and investigation depth.
- Conditions for retaining, advancing, blocking, or closing a issue; unresolved policy stays a question.
- Existing public labels and their meanings, replacement rules, and concise comment conventions. Use ordinary public language without tool branding.
- What additional review or execution requires approval. Never execute contributor code during initial scanning.

The generated skill must use the agent's current conversation as the interface. Collect using `smol scan issues` (optional `--search QUERY`); inspect evidence; record findings and exact proposed actions with `smol propose`. Present the complete proposal, including exact public text, and wait for explicit user approval. Approval may select entries. Record the actual instruction using `approve-proposal`; publish only through `smol apply`. Run `smol workflow-help` for the CLI and proposal schema. Do not fabricate results or approvals or bypass smol using direct GitHub mutations.

Generated issue skills must record per-issue investigation through `smol issue start NUMBER triage --statement 'Actual user instruction'`, then `issue finish RUN_ID --file RESULT_JSON`. Use `issue block` for missing prerequisites and `issue resume` when resolved. A batch scan collects evidence but does not mean assessment has started or finished. Start verification separately with `issue start NUMBER verification`; read the returned verification skill and environment prerequisites. Run `smol workflow-help` for the result contract. Never edit runtime JSON or claim a state change before its CLI command succeeds.

Skill setup is local and does not authorize GitHub changes. `github_writes: "approval_required"` permits approved operations; it does not itself approve any operation. Do not silently enable writes or change a repository's gates. Run `smol validate` and summarize policy decisions and unresolved questions. No scan starts unless requested.
