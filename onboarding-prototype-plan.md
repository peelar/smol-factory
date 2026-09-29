# smol-factory prototype

Implemented as a Bun/Effect CLI, OpenTUI interface, and bundled smol-factory skill.
There is one repository-local format, with no compatibility layer.

- `smol` opens the TUI; CLI commands and UI actions share the workflow engine.
- `smol init` creates a draft `.smol-factory/smol-factory.json`, context, three assessment skills,
  personal runtime scaffold, ignore rules, and repository skill registration.
- `smol inspect` collects bounded committed-source and read-only GitHub history.
  The current agent infers policy using the installed skill, records evidence and
  questions, and presents the proposal before maintainer acceptance.
- `smol accept-setup` records acceptance without advancing a PR gate.
- `smol doctor` separates configuration, acceptance, runtime and GitHub checks.
- `smol skill install --global` provides discovery before entering a repository.
- Local package archives include executable, schemas, UI, TypeScript config and
  skill. No registry publishing or MCP server is needed for this prototype.
- Queue actions require explicit confirmation; stale displayed assessments are
  rejected and all existing engine revision/approval checks apply.

Runtime execution still requires a configured adapter. No provider-specific
adapter, automatic model choice or test-backend provisioning is bundled. Onboarding
works with the current agent without that adapter. Verification commands are
inferred, not executed during setup. See README.md and configuration.md for use.

Validation covers isolated repository setup, bounded read-only history collection,
CLI root discovery, draft protection, repeat init, skill conflict preservation,
workflow gates, UI confirmation, stale UI decisions, rendering and archive use.
