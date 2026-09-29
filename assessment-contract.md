# Assessment contract

The agent harness coordinates reasoning and execution. smol owns persisted
assessments, evidence and approval gates. Human views render this state and
collect explicit maintainer decisions. Launch adapters remain optional execution
conveniences within that boundary.

`smol status` emits a JSON object with `version: 1`, replacing the prototype's
array of PR numbers, statuses and thread handles. Consumers read `assessments`.

| Field | Meaning |
| --- | --- |
| `freshness` | `local_snapshot`; no upstream query or process health check |
| `transition_checks` | Checks mutations apply as relevant; not checks run by status |
| `counts` | Total, needs maintainer, running, completed |
| `assessments` | Current assessment view for each locally known PR |

Each assessment carries `number`, `title`, `url`, `head`, `fingerprint`, persisted
`status`, current `gate`, derived `stage_status`, and `needs_maintainer`.
`stages` contains each gate's status, full result and approval record. Missing
results and approvals are `null`. `focus` is the current gate's result, or the
latest recorded result while the next gate is waiting/running. Its status is
included so stale evidence remains visibly stale. `thread` and `packet` retain
execution and evidence references.

`next` carries `actor`, `action`, `gate`, and a human-readable `reason`:

| Action | Actor | Interpretation |
| --- | --- | --- |
| `approve` | maintainer | Passing result awaits explicit approval for this fingerprint |
| `decide` | maintainer | Findings need a decision; an override needs rationale and then separate approval |
| `classify_scan` | harness | Classify the captured scan using its scan ID |
| `launch` | harness | Previous gate is approved; launch still checks revision and runtime readiness |
| `rescan` | harness | Evidence or approval is stale |
| `inspect` | harness | Inspect interrupted work or inconsistent state before continuing |
| `wait` | harness | Work is recorded as running; inspect thread for actual activity |
| `complete` | none | All assessment gates are approved; maintainer review remains |

These are next steps inferred from local state, not authority to act. `approve`
and `decide` require actual maintainer instructions. A result verdict is never
approval. A recorded running state is not a heartbeat. Status does not start
work, retry execution, or contact GitHub.

`src/assessment.ts` supplies the shared projection. Terminal overview and Markdown
reports display its next step and relevant findings; the machine response retains
full findings and evidence. Result summaries include their limits using the
existing result contract. No result or policy migration is required.
