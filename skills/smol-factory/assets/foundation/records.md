# Issue and PR memory

Read before starting, resuming, or publishing item work. The item record is our
working memory; labels are public workflow position, not an evidence store.
`records.types.ts` defines the data contract. Do not execute TypeScript config to
load these records, and do not claim that local records prove authorization.

## Layout

Under ignored `.smol-factory/local/items/`, use `issues/<number>/` or
`pullRequests/<number>/`. Both are bound to `policy.repository`; check repository
name **and host** before reusing an item number. Each directory contains:

- `record.json`: a `ItemRecord`, with revisions, basis, current stage, outcomes,
  verification need, checks, stage authorizations, proposals, receipts and history.
- `understanding.md`: our interpretation, evidence, hypotheses, uncertainties,
  related history and next action. Start from `understanding.template.md`.
- `evidence/`: redacted source snapshots or check reports, when needed to preserve
  what was actually assessed. Link them from results rather than dumping them
  into conversation or GitHub.

Create a record on first investigation. Initialize arrays empty, approval absent,
`verificationNeed` as `undetermined`, and `publishedSummary` as null. Fill the
real item identity and snapshot; never copy another item's approvals. There is
no central runtime database, required daemon or execution helper.

## Capture and checkpoint

Record current issue text and discussion digests, state and labels; for PRs also
record head/base commits. Compute SHA-256 digests over deterministic serialized
content using a normal available tool. Hash body/text files as exact UTF-8 bytes.
For discussions include comments and PR reviews/threads, with IDs, authors,
bodies and edit timestamps, sorted by stable ID; serialize objects with sorted
keys and no insignificant whitespace. Sort label names before comparing them.
Observation timestamps such as `capturedAt` do not make unchanged content stale.
Retain relevant snapshots so hashes have inspectable evidence. Hashes
identify freshness; they are not an access-control mechanism.

An `AssessmentBasis` names the item snapshot, accepted policy digest, references
actually read and their digests, trusted source commit and actual verification
environment if applicable. Each `StageResult` has its own basis. Store real
stage/execution approvals in `stageAuthorizations`, naming the basis, stage,
commands, environments and mutation scope they cover. Policy-authorized automatic
progression needs no fabricated human approval. Timestamp stage
start, block, resume and finish when they occur. A stage recorded `running` is
not proof of a live worker; inspect interrupted work before resuming it.

Separate observed facts, inferences and unknowns. Evidence names source paths and
commits, discussion URLs, or actual check reports. For verification, store exact
command/environment IDs, observed component versions and cleanup result. A PR
commit is not a backend version. No secret values belong in memory, even ignored
memory that might later be copied into a prompt.

The coordinating agent alone updates a shared record. Workers return separate
reports. Write updates atomically where tools allow (temporary file then rename),
retaining history and successful receipts. Never silently replace an existing
understanding with a newly generated summary that discards unresolved questions.

## Resume and invalidate

Read previous understanding, latest results, pending actions and any approved
GitHub summary before investigating. Look for reporter replies, changed commits,
resolved prerequisites and actual maintainer approvals. A new checkout may use
the approved public summary as evidence, but does not recover unpublished tests,
local receipts or authorizations. Reassess what cannot be established.

Compare the current item, trusted source, policy, stage references and verification
environment with each result's basis. If changed, mark affected results and
downstream proposals `stale`, append an invalidation event and resume at the first
affected stage. An issue edit can change classification or reproduction; PR
commits/base updates can invalidate review and tests; policy/environment changes
can invalidate permissions or verification. If the affected scope is unclear,
restart at the entry stage. Preserve old evidence and approvals as history.

A revised finding can supersede a proposal even when source revisions are
unchanged. Mark pending proposals based on superseded conclusions stale before
presenting replacements; do not publish yesterday's verdict from today's record.

Do not reuse an approval for a materially changed action or assessment. Own
successful writes recorded by receipts are expected effects, not unseen external
edits. Reconcile those effects before applying remaining operations. A current
GitHub label never revives a stale local result.

## Our understanding

Keep interpretation separate from the contributor's wording. Explain what the
item seeks, how the repository currently behaves, why it matters, what is known
or hypothesized, relevant history, applicable requirements, and what would resolve
remaining uncertainty. Update it after evidence changes, not just at completion.

Public summaries are deliberate communication, not automatic checkpointing.
Store the comment ID/URL and approved body digest after successful publication.
The public summary contains only shareable findings and next steps. Label changes
and summary updates remain separately authorized actions. A later agent reads
public summaries as evidence, not as permission to bypass repository policy.
