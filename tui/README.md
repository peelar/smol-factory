# smol-factory terminal

`smol` opens a dedicated onboarding state in a new repository, or the queue when
configured. Valid configuration makes the queue available.
`smol tui --root PATH` targets an explicit repository. `bun run tui:demo` displays
nonmutating examples.

`setup.tsx` installs the repository skill, then hands setup to a coding agent with an
explicit prompt. The agent checks for `.smol-factory/smol-factory.json`, initializes it when missing,
writes policy, validates configuration, and checks readiness. Refreshing the TUI reads the
resulting state. The TUI never starts scans during setup.
`app.tsx` leads with decisions and findings; `actions.ts` applies actions
through the shared Factory engine under its mutation lock. Approvals and launches
are separate. Before a decision, the displayed fingerprint must match persisted
state; the engine also checks upstream freshness. Blocked overrides require a
reason via the CLI. Closing a terminal does not undo already persisted results.
Inspect state and adapter checkpoints before retrying an interrupted launch.

`files.ts` projects assessment state, scan manifests and model names from
`.smol-factory/` once per second. `live.ts` joins current GitHub title, author,
revision and eligibility by PR number, refreshing every five minutes or on `r`.
PRs currently excluded by the scan rule are removed from the visible queue. GitHub
Issues and PR browser pages omit core members, owners, and bots; page counts refer
to the remaining items in GitHub's first 1,000 search results. Reads happen in
the background; failures leave saved details visible with a
warning. A changed title or head warns that the saved assessment needs a new
scan. Invalid local reads retain the last good snapshot. The displayed status
is local assessment state, not a process heartbeat. Terminal control sequences
in external text are stripped.

The overview shows the pending action and relevant result before historical
stage details. Full findings remain in Evidence; runtime models live in Artifacts.
The shared `src/assessment.ts` projection also powers CLI status and reports.
“Needs me” includes passing results awaiting approval and blocked findings
awaiting a maintainer decision. Stale and interrupted work go to the harness.

Keys: Tab switches the Issues and PR views; arrows/j/k select;
Enter opens the selected issue or PR's next step; right opens PR details and left returns to the list; 1–4 select detail tabs;
f filters; o opens setup; c classifies the latest scan; a previews a maintainer decision; x launches an approved stage; r refreshes;
q quits. Selecting a PR loads its description and file patches. Enter classifies the displayed revision after the preview loads. Approval dialogs still require confirmation and Escape cancels. Demo dialogs are
previews. Onboarding uses Enter to install the skill, r to refresh and q to quit. Once
configuration is ready, Tab returns to the queue.

Rendering tests capture wide, compact and setup frames under
`.runtime/tui-preview/`. `tests/factory.test.ts` covers workflow gates and revisions;
UI action tests cover stale displayed decisions and explicit confirmation.
