# tap

Skills and panes for teams of agents and people.

A tap is the valve on a stock. Work sits in the stock (your lists), and the tap controls how much of it flows through agents without a human. A low-trust repo has the tap barely open: agents carry work to a PR and a human merges. A repo with strong tests and verification has it wide open.

## Install

```
/plugin marketplace add teambrilliant/marketplace
/plugin install tap@teambrilliant-marketplace
```

Optional: `tap-pane` and `together` (Claude Code panes), `tap-labs` (experimental skills).

## Core skills (`tap`)

| Skill | Invoke | What it does |
| --- | --- | --- |
| product-thinker | `/tap:product-thinker` | Product decisions, UX analysis, build-vs-buy |
| strategic-thinker | `/tap:strategic-thinker` | Approach selection, tradeoffs, sanity checks |
| shaping-work | `/tap:shaping-work` | Rough idea → shape in `tap/shapes/` |
| write-plan | `/tap:write-plan` | Shape or ticket → plan in `tap/plans/` (layers, agent-runnable checks). Marks each plan `Gate: auto` or `Gate: human` |
| execute-plan | `/tap:execute-plan` | Plan → verified code; ends DONE or BLOCKED, no check-ins. With an autonomy policy it ends by running `/tap:ship` |
| qa-test | `/tap:qa-test` | Browser-based verification of acceptance criteria |
| explain | `/tap:explain` | ASCII + plain words: understand and defend a plan or change |
| blast-radius | `/tap:blast-radius` | Impact analysis of a change before merging. With an autonomy policy it ends in a verdict: `merge` or `human` |
| ship | `/tap:ship` | Finished work → main, as far as the autonomy policy allows: a fresh agent's verdict, then PR and merge, or commit and push, or a hand-over with the reason. Needs no plan |
| tap-audit | `/tap:tap-audit` | How ready a repo is for autonomous agent work; writes `tap/audit.md`, seeds `tap/architecture.md`, drafts the first `tap/autonomy.md` |
| tighten-loop | `/tap:tighten-loop` | Turn this session's course-corrections into durable, repo-portable fixes |
| qa-smoke-catalog | `/tap:qa-smoke-catalog` | Explore a web app and build `tap/smoke-tests.md` |
| qa-smoke-run | `/tap:qa-smoke-run` | Run the smoke-test catalog in a browser; report only what's broken |

## Typical flow

```
shape → plan → execute → QA → blast radius
  product-thinker / strategic-thinker (before and during)      explain (any time)
```

1. `/tap:shaping-work` — define what to build → `tap/shapes/`
2. `/tap:write-plan` — design how to build it, layer by layer → `tap/plans/`
3. `/tap:execute-plan` — build it to the contract: DONE or BLOCKED, verification included
4. `/tap:qa-test` — verify in a browser (execute-plan runs it for UI criteria)
5. `/tap:blast-radius` — what the change decided on its own and what it could break
6. `/tap:ship` — in a repo with an autonomy policy: verdict, then merge, push, or hand over

## Autonomy policy

A repo opens the tap with one file, `tap/autonomy.md`, on its main branch. It sets a ceiling (`none`, `low`, `medium`, `all`), says whether work is delivered by PR or by push to main, what never goes without a human, which checks must pass, and how to verify afterwards. Nothing else under `tap/` has to exist. Two gates:

- **Plan gate** (`write-plan`): a plan is `Gate: human` when it changes what users see, rewires the data model, rewrites rows, can't be reverted, adds a dependency, infrastructure or cost, or rests on a call that is yours. Otherwise it is `Gate: auto` and goes straight to execution.
- **Merge gate** (`ship`, `blast-radius`): `/tap:ship` takes any finished work, with or without a plan. A fresh agent rates the change's risk, applies five fixed rules, and compares the risk with the ceiling. `merge` → `ship` merges the PR, or commits and pushes to main, and verifies. `human` → the work comes to you as an open PR or a pushed branch, with the reason.

`/tap:tap-audit` drafts the file as a PR, or leaves it uncommitted where the repo has no PRs; it takes effect when you merge or push it. No file, no gates: the repo behaves as before. Set `Ceiling: none` to stop all automatic merging. Format and rules: [`plugins/tap/skills/blast-radius/references/autonomy.md`](plugins/tap/skills/blast-radius/references/autonomy.md).

## Labs (`tap-labs`)

Experimental. Installed separately so these stay out of the way: `/plugin install tap-labs@teambrilliant-marketplace`.

| Skill | What it does |
| --- | --- |
| product-primitives | System → fundamental primitives and building blocks |
| product-discovery | Validate an idea before committing to build |
| working-backwards | PR-FAQ to pressure-test an idea customer-first |
| loop-check | What one workflow needs for its feedback loop to be autonomous |
| systems-health | Dev system health via stocks, flows, feedback loops |
| retrospective | Just-in-time retro focused on agent autonomy |
| curate-product-context | Install and maintain `tap/product.md` |
| alignment-atlas | Flow-by-flow alignment-diagram atlases |
| render-doc | Render a markdown doc or docs tree to self-contained HTML |
| dossier-publish | Publish docs to Dossier and pull them back with comments |

## Panes (Claude Code only)

| Plugin | What it does |
| --- | --- |
| `tap-pane` | Side pane with the active `tap/plans/` plan as a progress card, each tick checked against the commands that actually ran, plus the session's ★ views. `/tap-pane` opens it. |
| `together` | Shared checklists in `tap/lists/` for you, Claude and other people. `/together:list` writes them; `/together` shows the pane. |

[CONTRACTS.md](CONTRACTS.md) lists what skills must emit for the panes to read.

## The `tap/` directory

```
tap/
  shapes/    shaping-work output
  plans/     write-plan output
  research/  discovery and investigations
  lists/     together checklists
  audit.md  architecture.md  smoke-tests.md  product.md
```

Committed on the branch of the work it describes.

Coming from `thoughts/` and `.tap/`? `scripts/migrate-repo.sh <repo>` prints what it would move; add `--apply` to do it. It never commits.

## Rollout & Rollback (continuous delivery primitives)

Cross-cutting across `shaping-work`, `write-plan`, `strategic-thinker`, and `execute-plan`. The reference doc at [`plugins/tap/skills/write-plan/references/rollout-primitives.md`](plugins/tap/skills/write-plan/references/rollout-primitives.md) defines two mechanisms and three decisions.

**Two mechanisms:**

- **Expand-contract** — evolve a shared contract (DB schema, public API, multi-consumer interface) safely by shipping additive changes first, migrating consumers, then removing the old path. The migration cadence IS the rollout.
- **Feature flag** — wraps a user-visible code path. Serves two purposes (either justifies a flag):
  - **Launch control** — cohort, tier, geo, timing, %-rollout, A/B, dogfooding
  - **Reversibility** — kill-switch for critical-path / uncertain / risky changes

**Three decisions (every plan walks this tree):**

1. **Contract test** — is a shared contract changing? → expand-contract.
2. **Launch-strategy test** — who should see this, and when? → flag (launch flag).
3. **Kill-switch test** — if bad in prod, what would I do? → flag (risk flag).

Default is **no flag, no expand-contract**. Pick the lightest mechanism(s) that produce the launch control AND reversibility actually needed. One flag per feature, at the user-visible boundary. Bug fixes never get flags. Schemas can't be flagged — flag the consumer, expand-contract the schema.

The flag system itself (PostHog / LaunchDarkly / static config / DB-driven / none) is discovered from `tap/architecture.md`, which `/tap:tap-audit` seeds during a repo audit. Planners read it; they don't re-derive it on every plan.

## Compose a pipeline

The skills are blocks. Tap ships no orchestrator: the loop that takes a piece of work through plan, build and ship is yours, written for whatever you run agents with. [CONTRACTS.md](CONTRACTS.md#pipelines) lists what a pipeline can rely on. Two recipes, each a few lines of `CLAUDE.md`:

**One session works a list.**

```markdown
## Pipeline: work the list

When I say "work the list":

1. Take the first open `@claude` item in the list that `tap/autonomy.md` names under `## Work list` (or the list I name). Mark it `[~]`.
2. Small and clear → build it. Anything else → `/tap:write-plan`.
3. The plan is `Gate: human` → give me the item: owner `@me`, a note with the plan's path. Go to 1.
4. `/tap:execute-plan` (or `/tap:ship` if there was no plan). It builds, verifies and ships.
5. `Outcome: merged` → the item is ticked with a `→` note. Any other outcome → the item is mine, with the reason and the link.
6. Go to 1. Stop when no `@claude` item is open.

To run it unattended, start one session per item: `claude -p "work the list, one item"`.
```

**One session you talk to, a sub-agent per stage.**

```markdown
## Pipeline: supervisor and workers

You are the supervisor. I talk to you; you don't plan, build or review yourself. Each stage runs in its own sub-agent (for example Fable in this session, `model: opus` for the sub-agents), and you hand me what it returns.

1. Plan → sub-agent: "run `/tap:write-plan` for <the work>". Show me its ★ Plan View unchanged, and the plan path.
2. `Gate: human` → wait for me. My changes go back to a sub-agent with the plan path. `Gate: auto` → go on.
3. Build → sub-agent: "run `/tap:execute-plan <plan> approved`, and stop before shipping". Show me its report, Decisions first.
4. `Contract: DONE` → run `/tap:ship` yourself. It starts the reviewer as another sub-agent.
5. Tell me the `Outcome:` line and the link. Anything but `merged` → say what I need to do.
```

The pane pins ★ views only from the session you talk to, which is why step 1 shows the Plan View unchanged. The models are an example; the rule is one sub-agent per stage.

For the single-session flow with routing, copy the template into a repo and add project-specific sections (dev server, database, tools) below the workflow block:

```bash
cp "$(claude plugin path tap)/references/CLAUDE.local.template.md" ./CLAUDE.local.md
```

## History

This repo merges `teambrilliant/dev-skills` (through 3.2.0), `teambrilliant/tap-skills` (through 0.19.0), the `thoughts` pane from `teambrilliant/claude-code-mods`, and `together`. Git history for each is preserved. The `tap-skills` changelog is at [docs/history/tap-skills-CHANGELOG.md](docs/history/tap-skills-CHANGELOG.md).
