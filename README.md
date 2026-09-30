# smol-factory

Skills for establishing a repository's issue and PR workflow. An agent learns
how the project handles contributions, proposes stages and typed policy, then
uses GitHub labels to communicate approved workflow status.

## Establish a factory

Point your agent at the bootstrap skill and the repository you maintain:

```text
Read https://github.com/peelar/smol-factory/blob/main/skills/smol-factory/SKILL.md
and establish the factory in /path/to/my-repository.
```

A GitHub repository URL also works as the target; the agent resolves its local
checkout with you. It reads the skill and its assets from one source revision,
inspects the target's documents, code and issue/PR history, and presents a concrete
configuration for acceptance. The base experience requires no package, CLI or
global skill installation.

Onboarding creates the repository's foundations and two local skills:

```text
.agents/skills/
  scan-issues/SKILL.md
  scan-prs/SKILL.md
.smol-factory/
  policy.ts
  policy.types.ts
  records.types.ts
  context.md
  operations.md
  records.md
  understanding.template.md
  stages/
    validate.md
    classify.md
    review.md
    verify.md
    ready.md
  local/                    ignored: environment and item memory
```

Then ask your agent to use **scan-issues** or **scan-prs**. Both can scan a batch or
work on a named item. They resume actionable work before admitting new submissions
and run entirely from the target repository's local foundations. If your agent
does not discover `.agents/skills`, ask it to read the corresponding `SKILL.md`
directly. To revise the factory later, read the bootstrap skill again.

## Repository policy

[`policy.ts`](skills/smol-factory/assets/foundation/policy.ts) is a declarative
TypeScript configuration checked against
[`FactoryPolicy`](skills/smol-factory/assets/foundation/policy.types.ts).
It contains permissions, requirements, transitions, references, labels, intake,
worker limits and verification scope. Markdown supplies context, preferences and
assessment guidance. Every stage reads its assigned references.

Defaults are a proposal, tailored during onboarding:

| | Stages |
| --- | --- |
| Issues | Validate → classify → verify when needed → ready to be worked on |
| PRs | Validate → classify → review → verify → ready for maintainer acceptance |

Start with 10 items per scan, at most 3 workers, 1 code reviewer and 1 verification
environment concurrently. Assessment favors economical available models; review
favors deeper reasoning. Without delegation, work runs serially. Team submissions
and draft PRs are included; repository-specific exclusions are explicit.

The maintainer can redefine stages, references, limits and rules. For example,
requiring a linked issue belongs in that repository's typed requirements, not the
base skill. Historical decisions inform proposed rules; they do not automatically
become policy. Verification names commands, environment prerequisites, observed
software versions and cleanup. Code runs only in permitted verification.

## Public actions and memory

**Every GitHub write starts with `requireApproval`**, including labels, comments,
closure, reviews and merges. The agent shows exact proposed actions and wording
before acting. Accepting local setup does not approve label creation or any other
GitHub change. Later autonomy requires explicit grants for particular operations,
conditions and effects; successful assessments cannot grant it automatically.

Typed policy makes instructions precise. It is **agent guidance, not a security
boundary**: there is no write broker, custom executor or guarantee against an agent
bypassing instructions. Agents use ordinary GitHub tools and confront their
actions with the accepted policy.

Each issue/PR has a structured local record and `understanding.md`: intent,
evidence, hypotheses, related history, checks, versions, questions and next steps.
Approved GitHub summaries carry shareable understanding across checkouts. Changed
submissions, policy or environments invalidate affected results and proposals;
earlier evidence remains history. Proposed labels are distinct from public writes
that actually succeeded.

## Work on these skills

The bootstrap and its supporting documents live in
[`skills/smol-factory/`](skills/smol-factory/SKILL.md). Local scan skills and
foundation files are assets copied and tailored during onboarding. There is no
application runtime or dependency installation for this repository.

Check skill frontmatter, links, the onboarding copy map and typed assets when
changing them. Use a trusted TypeScript compiler if already available; source-only
validation does not execute the target project's code. Test substantial workflow
changes with an isolated onboarding/scan scenario before publishing.

The structure draws on [Matt Pocock's skills](https://github.com/mattpocock/skills)
and [Lauren's pstack](https://github.com/cursor/plugins/tree/main/pstack).

[MIT license](LICENSE)
