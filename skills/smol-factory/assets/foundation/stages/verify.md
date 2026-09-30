# Verify against an identified environment

Read configured stage/environment references and the item's prior understanding.
Check verification permission, command permission, isolated workspace, required
variables, actual software versions, mutation scope and cleanup before execution.
Choose only configured applicable commands. Missing configuration, required
services or approval blocks the stage; report the precise prerequisite. Do not
require services for source-only/unit checks.

Freeze the actual checked source and relevant deployed/backend versions. For a
Saleor repository this can include frontend commit, Saleor version, API endpoint
environment and fixture scope. A linked release or contributor's stated version
is not proof of the running environment. Keep credentials private.

For issues, reproduce the exact reported scenario on the relevant supported
version and compare expected versus actual behavior. Record whether confirmed,
already fixed, not reproduced or incomplete. Not reproduced alone does not prove
invalidity; document coverage and missing conditions. Follow repository policy
when deciding whether the evidence is sufficient to pass.

For PRs, run the relevant configured checks and scenarios for the frozen change.
Record command/environment IDs, results and evidence. Skipped, failed or blocked
checks are not passing verification. Contributor code runs only here, within the
accepted scope. Prevent overlapping service/test-data usage and complete agreed
cleanup. Record unresolved cleanup as a blocker.

Finishing an investigation is distinct from passing it. Update both structured
results and our understanding, including actual versions, limits and next steps.
