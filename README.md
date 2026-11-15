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
| execute-plan | `/tap:execute-plan` | Plan → verified code; ends DONE or BLOCKED, no check-ins. With an autonomy policy it also opens the PR, merges on a `merge` verdict and verifies |
| qa-test | `/tap:qa-test` | Browser-based verification of acceptance criteria |
| explain | `/tap:explain` | ASCII + plain words: understand and defend a plan or change |
| blast-radius | `/tap:blast-radius` | Impact analysis of a change before merging. With an autonomy policy it ends in a verdict: `merge` or `human` |
| tap-audit | `/tap:tap-audit` | How ready a repo is for autonomous agent work; writes `tap/audit.md`, seeds `tap/architecture.md`, drafts the first `tap/autonomy.md` as a PR |
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

## Autonomy policy

A repo opens the tap with one file, `tap/autonomy.md`, on its main branch. It sets a merge ceiling (`none`, `low`, `medium`, `all`) and says what never goes without a human, which contracts other repos consume, which checks must pass, and how to verify after a merge. Two gates read it:

- **Plan gate** (`write-plan`): a plan is `Gate: human` when it changes what users see, rewires the data model, rewrites rows, can't be reverted, adds a dependency, infrastructure or cost, or rests on a call that is yours. Otherwise it is `Gate: auto` and goes straight to execution.
- **Merge gate** (`blast-radius`): a fresh agent rates the PR's risk, applies nine fixed rules, and compares the risk with the ceiling. `merge` → `execute-plan` merges and verifies. `human` → the item comes to you with the reason.

`/tap:tap-audit` drafts the file as a PR; it takes effect when you merge it. No file, no gates: the repo behaves as before. Set `Ceiling: none` to stop all automatic merging. Format and rules: [`plugins/tap/skills/blast-radius/references/autonomy.md`](plugins/tap/skills/blast-radius/references/autonomy.md).

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

## Workflow automation

Copy the template into any repo to get the skill chain with routing:

```bash
cp "$(claude plugin path tap)/references/CLAUDE.local.template.md" ./CLAUDE.local.md
```

Then add project-specific sections (dev server, database, tools) below the workflow block.

## History

This repo merges `teambrilliant/dev-skills` (through 3.2.0), `teambrilliant/tap-skills` (through 0.19.0), the `thoughts` pane from `teambrilliant/claude-code-mods`, and `together`. Git history for each is preserved. The `tap-skills` changelog is at [docs/history/tap-skills-CHANGELOG.md](docs/history/tap-skills-CHANGELOG.md).
