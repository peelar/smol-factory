# Proposed workflow improvements

Proposals have no authority until the maintainer accepts them. Do not silently
edit workflow, context, exclusions, or approval policy.

## 2026-09-29: Concise, evidence-backed stage reports

Status: proposal 1 accepted by the maintainer ("makes sense, go") and implemented
on 2026-09-29. Proposals 2–4 remain proposed. Approval semantics are unchanged.

Sources:
- [Vercel factory article](https://vercel.com/blog/building-a-software-factory-for-ai-sdk)
- [Issue classification](https://github.com/vercel/ai/issues/20932#issuecomment-5707582184)
- [AI SDK 7 reproduction](https://github.com/vercel/ai/issues/20932#issuecomment-5707751222)
- [AI SDK 6 reproduction](https://github.com/vercel/ai/issues/20932#issuecomment-5707887161)

The issue's factory comments lead with a conclusion, then support it with specific
observations. Reproduction establishes both that the symptom occurs and that its
fix belongs upstream. It also records checks that could not finish. These are
public reports of the runs; this assessment did not inspect their reproduction
artifacts or independently execute them.

Smol already has distinct stage skills, explicit approvals, revision fingerprints,
retained evidence, and separate Overview/Evidence/History TUI tabs. The useful
improvements are in presentation and evidence quality within that local workflow.

### 1. Give each stage a compact decision summary (first priority)

Current example: `src/schema.ts` has a free-form summary and arrays of findings
and evidence. `Factory.save` in `src/factory.ts` writes status followed by the
entire chronological history. `tui/app.tsx` shows the current summary and all its
findings, but there is no consistent summary contract.

Propose a shared presentation format: outcome, one-sentence reason, decisive
evidence, limitations, and the specific pending maintainer decision. Aim for
roughly 80–150 words per stage, with full findings and artifacts accessible below
it. Never truncate a blocking finding out of the detailed report. Derive approval
state and available actions from the engine rather than agent-written prose.

Illustrative output, not an actual PR assessment:

```text
Review · Needs changes
Saving a channel can discard an existing selection.

Evidence: the submit handler replaces the stored list with visible rows.
Finding: ChannelForm.tsx:84 — preserve selections outside the current page.
Limits: source inspection only; no tests run.
Next: maintainer decision on the finding. Verification has not been authorized.
```

Put current stage summaries above History in Markdown. Reuse the same presentation
in the TUI; keep full evidence in its existing tab. Start with a writing contract
using the current result schema; add fields only where reliable rendering needs
them. Benefit: faster decisions without losing the audit trail. Tradeoff: a word
target needs exceptions for complex changes and must not hide uncertainty.

### 2. Separate assessment verdict from why work stopped

Current example: `needs_changes` renders as “Blocked” in `tui/model.ts`;
`needs_decision` covers both missing verification capabilities and substantive
maintainer uncertainty. These require different next actions.

Propose recording a separate reason when relevant: contributor change needed,
environment unavailable, product decision needed, or agent/runtime failure. Keep
the existing verdict and approval semantics initially. A successfully performed
review can find a defective PR; that is not a failed agent run. A stage can also
establish useful facts while some checks remain blocked.

Benefit: distinguish “restore the backend,” “review product fit,” and “inspect
the finding” at a glance. Tradeoff: schema and migration work; avoid adding an
elaborate second state machine for this small factory.

### 3. Make evidence limits and fault ownership explicit

Current example: the verification skill already requires commands, exit status,
observations, screenshots, and limitations. The review skill already requests a
verification plan. Results store these as unstructured strings.

Propose a small verification evidence table: check/scenario, expected result,
observed result, artifact, and passed/failed/blocked/not-run status. Carry the
review's planned checks into verification so omitted checks have an explanation.
Separate contributor-reported evidence, source inference, and factory-observed
behavior. State whether a finding belongs to the target repository, an upstream
service, the test environment, or remains unresolved.

Where necessary to attribute a failure, compare the same focused scenario on the
frozen base and head during approved verification. Do not require duplicate full
suites for every PR. Benefit: fewer false attributions and more useful partial
results. Tradeoff: occasional extra setup and runtime, especially for UI checks.

### 4. Turn maintainer corrections into a small regression corpus

Current example: helper tests mock GitHub and check engine behavior; they do not
establish the quality of agent classification or review judgments.

Propose collecting a few sanitized, frozen examples after maintainer corrections:
evidence, mistaken conclusion, accepted conclusion, and why. Include uncertain
product fit, missing context, optional suggestions misreported as blockers, and
environment failures. Replay these when changing prompts or stage skills, using
the configured adapter when available. Assess conclusions and evidence grounding,
not exact wording. Policy changes remain proposals until explicitly accepted.

Benefit: repeat mistakes become visible. Tradeoff: maintaining representative
examples and paying for occasional agent runs; no evaluation platform needed.

### Suggested sequence and boundaries

Start with proposal 1, then 2 and 3 as real assessments reveal ambiguity. Collect
examples for 4 opportunistically. Existing stage-specific prompts and skills
already provide useful task boundaries; this comparison does not establish a
need for more agents, separate services, cloud queues, automatic GitHub comments,
implementation agents, or fewer approval gates.

Resolved in the checkout before this implementation: one documentation mismatch surfaced: AGENTS.md refers to the removed
`skills/scan-prs/SKILL.md`, while the checkout now provides
`skills/smol-factory/SKILL.md`. Align that entry point in a separate accepted
documentation change.
