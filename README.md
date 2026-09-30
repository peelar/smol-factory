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
and contribution history, then proposes a workflow for your approval. Once
accepted, it saves the configuration in `.smol-factory/` and installs two local
skills in `.agents/skills/`: **scan-issues** and **scan-prs**.

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

## Use

Read the [bootstrap skill](skills/smol-factory/SKILL.md) directly—no package, CLI,
global installation or application runtime is required. Scans use an available
SQLite tool. Environment details and item records stay in ignored
`.smol-factory/local/`; keep secrets out of Git, prompts, reports and screenshots.

To view records, run from this source checkout:

```sh
cd viewer
npm ci
npm run dev
```

Open <http://127.0.0.1:8765>. The viewer uses Next.js, React and Tailwind CSS
and requires Node.js 24+ for built-in SQLite access. It binds only to localhost;
stop with Ctrl-C. Onboarding creates `viewer/.env.local` from `viewer/.env.example`
in an available local source checkout and fills in your repository’s database path.
If you downloaded the viewer afterward, copy `.env.example` to `.env.local` and
set its database path once. The default points to this checkout’s database.
Use `npm run build` then `npm start` for production. Run `npm test` and
`npm run typecheck` to check the app. Filter items and click cards for details;
refresh rereads storage.
The viewer supports custom stages and does not modify records or perform GitHub
actions. It is not copied during onboarding.

## Contribute

The [bootstrap skill](skills/smol-factory/SKILL.md) and its assets live in
`skills/smol-factory/`. Preserve maintainer customizations and local evidence.
Check frontmatter, links, destination references, the onboarding copy map and
TypeScript contracts when changing assets. Use a trusted compiler if available;
validation must not execute target or contributor code. Forward-test substantial
workflow changes in temporary onboarding/scan fixtures without GitHub writes.

Inspired by [Matt Pocock's skills](https://github.com/mattpocock/skills)
and [Lauren's pstack](https://github.com/cursor/plugins/tree/main/pstack).

[MIT license](LICENSE)
