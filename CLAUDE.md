# CLAUDE.md

Guidance for working in this repository.

## What this is

Tap: skills and panes for teams of agents and people. One repo, four plugins under `plugins/`:

| Plugin | Holds | Runs in |
|---|---|---|
| `tap` | The 12 core skills. Markdown only: no build, no tests. | Claude Code, pi, Codex |
| `tap-labs` | Experimental skills, kept out of core until they earn a place. | same |
| `tap-pane` | Side pane: plan progress from `tap/plans/` and pinned ★ views. | Claude Code only |
| `together` | The `list` skill and its pane for shared checklists in `tap/lists/`. | Claude Code only |

A tap is the valve on a stock: work sits in the stock (the lists), and the tap controls how much of it flows through agents without a human.

## Rules across plugins

- **Core never references labs.** No `tap-labs:` skill name and no relative link into `plugins/tap-labs` from `plugins/tap`. Labs may reference core. `scripts/check-refs.sh` enforces both.
- **Promotion is a folder move** from `plugins/tap-labs/skills/` to `plugins/tap/skills/`, plus a rename of its references.
- **`CONTRACTS.md` specifies what panes read from skills.** Change it in the same commit as the skill or pane it binds: every ★ block opens `★ <Kind> ─────` and closes `───── ★`; every plan Phase Check item starts with its command in backticks; `execute-plan` ticks `- [x]` right after each check passes.
- Bump a plugin's `plugin.json` version on behavioral changes. `package.json` follows `tap`.

## Skills

Each skill lives at `plugins/<plugin>/skills/<name>/SKILL.md` with an optional `references/` subdirectory, and is invoked as `/tap:name` or `/tap-labs:name`.

```yaml
---
name: kebab-case-name
description: what + triggers   # trigger phrases drive auto-detection; keep it short, it loads on every session
allowed-tools: [...]           # optional
---
```

Workflow stages: `shape → plan → execute → QA`. `product-thinker` and `strategic-thinker` pair with shaping and planning; `explain` works at any stage; `blast-radius`, `tap-audit`, `tighten-loop` and the `qa-smoke-*` pair are the harness around the pipeline.

When editing skills:

- Reference files are for templates and examples too large for `SKILL.md`.
- Skills use sub-agents for context-heavy work (browser testing, codebase research) to keep the main thread lean.
- Test a skill change by invoking it in a real project.

## The `tap/` directory in a repo

Skills read and write `tap/` in the repo being worked on:

```
tap/
  plans/  shapes/  research/  lists/
  product.md  architecture.md  audit.md  smoke-tests.md  learnings.md  diagrams/
```

- Files are named `YYYY-MM-DD-descriptive-name.md`, hyphens only.
- Files under `tap/` are committed on the branch of the work they describe.
- Persist only what the harness executes against (shapes, plans, research, lists). Views (★ blocks) and explanations are session-scoped and never written to `tap/`.
- QA evidence (failure screenshots only) goes in `./qa-evidence/`.
- `scripts/migrate-repo.sh <repo>` moves a repo from the old `thoughts/` and `.tap/` layout. It is a dry run unless `--apply` is passed, and it never commits.

## Panes (`tap-pane`, `together`)

Function-hook plugins on the early-access API. Layout per pane: `.claude-plugin/plugin.json`, `hooks/hooks.json` → `hooks/register.tsx`, `types/index.d.ts` (the `$.state` contract), `tests/*.test.ts(x)`.

- Always call `~/.local/bin/claude`. The shell alias `claude --channels …` swallows `plugin` subcommands.
- `~/.local/bin/claude plugin test plugins/<name>` · `~/.local/bin/claude plugin validate plugins/<name>` · `cd plugins/<name> && bunx tsc -p .`
- Run a pane from its folder: `~/.local/bin/claude --plugin-dir plugins/<name>`.
- tsc reads the API from `.claude-plugin/types/` (gitignored). The engine writes it there whenever it loads the pane; before the first load, copy the plugin-authoring skill's `types/claude-code.d.ts` to `.claude-plugin/types/claude-code/index.d.ts`.
- The test kit has no fs: fixtures are generated into `tests/fixtures/fixtures.gen.ts` (`bun plugins/tap-pane/scripts/build-fixtures.ts`; for together, `bun scripts/build-fixtures.ts` from its folder).
- The kit can't answer `session.append` (it requires `next`, and nothing sits beneath it in a test), so test the logic behind that hook through another entry point.
- If the kit says hooks modules are turned off ("rollout switch"), run it once with network access.
- Band (`AbovePrompt`) hooks always `await next(e)` and stack their line with it, never return a tree in its place: one pane that doesn't call `next` hides every band beneath it, other people's included.
- To bring a pane to the front from a press, close it and open it again: `$.ui.open` on an id that's already open only changes its title and leaves it behind other tabs.

## Distribution

`teambrilliant/marketplace` lists each plugin with a `git-subdir` source (`path: plugins/<name>`). pi loads `plugins/tap/skills` through `package.json`.
