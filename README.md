# smol-factory

Repository-local skills for handling GitHub issues and pull requests.

---

smol-factory gives your coding agent a workflow for triaging issues and reviewing
pull requests using your repository's rules.

To set it up, open your repository in your agent and send:

```text
Read https://github.com/peelar/smol-factory/blob/main/skills/smol-factory/SKILL.md
and establish the factory.
```

No package or global installation is needed. The agent inspects your repository
and contribution history, then proposes a workflow for your approval. Proposals,
drafts, setup patches and evidence are saved immediately in the repository's
ignored `.smol-factory/local/onboarding/`, including while awaiting approval.
Once accepted, it writes the active configuration in `.smol-factory/` and installs
two local skills in `.agents/skills/`: **scan-issues** and **scan-prs**.

To use it, ask your agent:

```text
Use scan-issues to triage open issues.
Use scan-prs to review PR #123.
```

Each scan assesses submissions against your rules, runs permitted verification,
and records findings, blockers and next steps locally. Later scans resume from
those records. Expect issues ready to work on, PRs ready for maintainer review,
or an explanation of what still needs attention. GitHub changes are proposed
for approval by default.

## Features

- Repository-specific stages, requirements, references, labels and permissions in
  [`policy.ts`](skills/smol-factory/assets/foundation/policy.ts), checked against
  [`FactoryPolicy`](skills/smol-factory/assets/foundation/policy.types.ts).
  Markdown provides context and assessment guidance; each stage reads its references.
- Default issue flow: validate → classify → verify when needed → ready to work on.
  PR flow: validate → classify → review → verify → ready for maintainer acceptance.
- Configurable intake and worker limits. Defaults: 10 items per scan, up to
  3 workers, 1 reviewer and 1 verification environment concurrently. Work runs
  serially without delegation. Team submissions and draft PRs are included by default.
- Code execution only during permitted verification, with configured commands,
  prerequisites, observed versions and cleanup. Scans do not repair contributor code.
- Local SQLite records and per-item `understanding.md` preserve evidence, checks,
  questions and next steps. Changes to submissions, policy or environments
  invalidate affected results while retaining history. Approved GitHub summaries
  share understanding across checkouts.
- An optional, read-only kanban board for browsing recorded stages, results and proposals.

> [!NOTE]
> Every GitHub write starts approval-required, including labels, comments, closure,
> reviews and merges. The agent shows exact actions and text for approval. Accepting
> setup does not approve GitHub changes. Autonomy requires an explicit, accepted
> grant matching the operation, conditions and effects; successful runs cannot grant it.
> Policy is agent guidance, not a security boundary or enforcement mechanism.

[MIT license](LICENSE)
