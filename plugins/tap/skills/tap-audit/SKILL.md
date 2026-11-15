---
name: tap-audit
description: Assess how ready a repository is for autonomous agent work. Use when someone says "audit this repo", "tap audit", "how ready is this codebase", "assess this project", "draft autonomy", "propose an autonomy policy", or when an agent enters an unfamiliar codebase and needs to understand it before working. Scans documentation, MCP servers, CLI tools, permissions, test infrastructure, environments, and process to produce a readiness assessment with actionable leverage points. Outputs to tap/audit.md, and drafts the repo's first tap/autonomy.md as a PR.
---

# TAP Audit

Assess how autonomous an agent can be in this repo right now. Produce a structured assessment at `tap/audit.md`.

This skill does NOT describe coding conventions — that's CLAUDE.md's job. This skill assesses the system: what's configured, what's missing, what's slowing delivery or letting bugs through.

## Process

0. Check existing audit
1. Scan the repo
2. Assess each dimension
3. Score readiness
4. Identify leverage points
5. Write `tap/audit.md`
6. Seed `tap/architecture.md`
7. Propose `tap/autonomy.md` as a PR
8. Present findings (human) or proceed to task (agent)

### 0. Check Existing Audit

If `tap/audit.md` exists, read it before doing anything else.

1. Parse `Last run:` date from the file.
2. Run `git log --oneline --since="[date]"` to count commits since last audit.
3. Check if key config files changed since that date: `git diff --name-only HEAD@{[date]} -- .claude/ .mcp.json package.json .github/workflows/ CLAUDE.md`

**Decision tree:**

| Condition | Action |
|-----------|--------|
| `--force` flag | Full re-run (skip to step 1) |
| <30 days old, no key config changes | **Summary mode**: print score + top leverage points + audit age. Say "Audit is current ([N] days). Use `--force` to re-scan." **STOP.** |
| <30 days old, key config changed | **Delta mode**: re-assess only affected dimensions. Update `tap/audit.md` in-place with new `Last run:` date. Skip unchanged sections. |
| >=30 days old, significant repo activity (many commits, new contributors) | Recommend full re-run. Ask before proceeding. |
| >=30 days old, low activity (few commits, same contributors) | **Summary mode**: the audit is likely still accurate. Print score + leverage points. Say "Audit is [N] days old but repo activity is low. Use `--force` to re-scan." **STOP.** |
| Date missing or unparseable | Full re-run (skip to step 1) |

The audit file IS the cache. Don't re-scan what hasn't changed.

### 1. Scan the Repo

Read these files/locations (skip any that don't exist):

```
.claude/settings.json         → permissions
.claude/settings.local.json   → local overrides
.mcp.json                     → MCP servers configured
CLAUDE.md                     → coding instructions quality
AGENTS.md                     → agent-specific boundaries
package.json / Cargo.toml / go.mod / requirements.txt → stack + scripts
tsconfig.json / biome.json / .eslintrc → tooling config
.github/workflows/            → CI/CD setup
tap/                         → existing project memory
vercel.json / fly.toml / Dockerfile / render.yaml → deploy config
```

Run (if tools available):
- `git log --oneline -20` → recent activity
- `git shortlog -sn --no-merges --since="90 days ago"` → contributors
- `gh run list --limit 5` → recent CI runs
- Test runner dry-run to discover test count
- Feature-flag system discovery — grep for known providers and local conventions:
  ```
  rg -l "posthog|launchdarkly|unleash|flagsmith" --type-add 'config:*.{ts,js,json,yml,yaml}' -tts -tjs -tconfig
  fd -e ts -e js 'flags?\.(ts|js)$' src/
  rg "NEXT_PUBLIC_FEATURE_|_FEATURE_FLAG" .env.example
  rg -l "feature_flags?" --type sql --type ts --type js
  ```
  Result feeds the "Feature flags" decision in step 5.

### 2. Assess Each Dimension

#### Environments

Discover all available environments with URLs. Check package.json scripts, deploy configs, CI workflows, CLAUDE.md, README.

```
- Local:      [command] → [url]
- Preview:    [url pattern or "not configured"]
- Staging:    [url or "not configured"]
- Production: [url or "not configured"]
```

#### Agent Harness Readiness

Assess six areas. Mark ✓ (available) or ✗ (missing/incomplete) for each item.

**Documentation**
- CLAUDE.md: exists? covers stack, conventions, run/test/deploy commands?
- AGENTS.md: exists? defines scope boundaries, escalation rules?
- ADRs: any architectural decisions documented?

**Strategic Context**
- `tap/product.md`: exists? ≤ 80 lines? `mtime` within 90 days?
- If missing or stale, flag in Leverage Points with fix: write or refresh `tap/product.md`

This dimension assesses whether durable product-strategic context (vision, what we build, audience, current focus, bets, non-goals) is installed as an agent-readable artifact. This skill does NOT author or modify `tap/product.md`.

**MCP Servers** (from .mcp.json)
- List each configured server and what it enables
- Flag missing ones based on stack (e.g., using Postgres but no DB MCP; web app but no chrome-devtools)

**Skills**
- What skills are available?
- What's missing for this stack? (e.g., Neon skill for Neon Postgres, Temporal skill for Temporal)

**CLI Tools**
- Verify: package manager, test runner, linter, build tool, deploy tool, DB CLI, infra CLI
- Flag tools the stack requires but agent can't access

**Permissions** (from .claude/settings.json + settings.local.json)
- What's explicitly allowed and denied?
- What's missing that blocks autonomous work?

**Test Infrastructure**
- Test count and coverage if discoverable
- Types present: unit, integration, acceptance, e2e, browser
- Can the agent verify its own work?

#### Readiness Score

- **FULL**: Agent can implement, test (unit + browser), access DB, verify end-to-end. CLAUDE.md comprehensive. All necessary MCP servers and CLIs configured.
- **PARTIAL**: Agent can implement and run some tests. Missing some integrations. CLAUDE.md exists but has gaps.
- **MINIMAL**: Agent can read/write code but can't run tests, no MCP servers, thin or missing CLAUDE.md.

#### Design Complexity

Quick spot check on how hard this codebase is to modify. Sample the 5-10 most-changed files recently (`git log --name-only --since="30 days ago"`) — these are what agents will touch most.

For each sampled file, check:
- **File size** — proxy for module depth. Large files doing too much = hard to understand, easy to break
- **Import fanout** — proxy for coupling. Many imports = many dependencies = change amplification risk
- **Layer structure** — pass-through wrappers, thin abstractions that add interface cost without hiding complexity
- **Consistency** — do similar things follow similar patterns, or does each file invent its own approach

Rate overall: **Easy** / **Moderate** / **Hard** to modify.
- **Easy**: small focused modules, low coupling, consistent patterns
- **Moderate**: some large files or high coupling, but patterns are clear
- **Hard**: god files, high coupling, inconsistent patterns, pass-through layers

Specific design smells found flow into Approach Gaps as actionable items.

#### Feedback Loops

Assess the repo's **top 3 workflows** using the five-element loop model — Generator / Legibility / Evaluator / Handoff / Grading — below. The most valuable finding is a workflow humans do by hand that an agent could own.

- **Generator** — can an agent produce the output? **Legibility** — can it observe the running system, not just the source? **Evaluator** — can something other than the generator verify the output, with an error it can act on? **Handoff** — can it reset context and resume? **Grading** — are quality expectations mechanically enforced?
- Discover workflows (binary assets without generators, git-churn iteration loops, human-in-the-loop scripts, prose pipelines in docs), rate each **Closed / Open / No loop / Manual**, and prescribe a concrete fix — a specific skill, MCP, hook, CLI tool, or test. "Add browser tests" is too vague; name the thing to build.

#### Approach Gaps

Don't repeat CLAUDE.md. Flag what's MISSING that causes agent rework:
- Test coverage gaps (which areas have no tests?)
- Missing ADRs (where do agents guess at architectural intent?)
- Undocumented patterns (inconsistencies agents will copy?)
- Design smells from the complexity spot check (god files to split, pass-through layers to collapse, inconsistent patterns to standardize)

#### Process

- Branching strategy
- CI/CD pipeline (what runs, recent pass rate)
- Deploy mechanics (auto or manual, to which environments)

#### Merge ceiling (proposed)

How much of this repo's work could merge without a human today. Propose one ceiling, `none`, `low`, `medium` or `all`, with its reasons, from five facts:

- **Checks on PRs** — do lint, typecheck and tests run on every PR, and which exact check names report?
- **Branch protection** — are those checks required on the main branch, for admins too?
- **Test coverage** — would a broken change to business logic turn a check red?
- **Deploy on merge** — does a merge reach users on its own, and how far?
- **Post-merge verification** — is there a command or workflow that says the merge is healthy?

No checks on PRs, or checks that aren't required → `none`, and the fix is a leverage point. Required checks but thin tests or no post-merge verification → `low`. Required checks, tests that catch broken logic, verified deploys → `medium`. `all` is for the operator to choose; never propose it.

### 3. Identify Leverage Points

Goal: **ship faster while maintaining quality bar.**

Find 3-5 leverage points. Each answers: what's slowing delivery OR letting defects through?

```
### N. [Short description] → [consequence]
- Symptom: [observable problem]
- Why it costs: [concrete impact on speed or quality]
- Fix: [cheapest intervention + estimated effort]
```

Prioritize by: cheapest fix that unblocks the most agent autonomy.

### 4. Write tap/audit.md

Create `tap/` directory if it doesn't exist. Write the assessment using the template in references/tap-audit-template.md.

### 5. Seed tap/architecture.md

**Always do this step.** If `tap/architecture.md` doesn't already exist, create it now.

Scan the codebase for deliberate architectural decisions — they're visible as:
- Consistent patterns across the codebase (same error handling everywhere)
- Config that implies decisions (Temporal config, ORM choice, auth provider)
- Package choices that constrain patterns (Result library, specific framework)
- Comments or docs explaining "why" something is done a certain way
- **Feature flag system** — always capture this as its own decision (`## Feature flags`). Use the grep results from step 1. Record: provider (PostHog / LaunchDarkly / Unleash / Flagsmith / static config / DB-driven / env-var / "None — direct deploy only"), where flags are defined and read, naming convention if any. Downstream planning skills read this section verbatim — if no flag system exists, write `"None — direct deploy only"` explicitly so planners don't re-discover its absence on every plan.

Write each decision in compressed format: 2-4 lines max. Capture the **principle** behind the decision so agents can apply it to novel situations. See [references/architecture-format.md](references/architecture-format.md) for format and examples.

**Do NOT create individual ADR files.** Everything goes in one `tap/architecture.md` — one file, ~50 lines, optimized for agent consumption.

If `tap/architecture.md` already exists, review it against what you discovered and note any missing decisions in the Approach Gaps section of `tap/audit.md`.

### 6. Draft the autonomy policy

Runs when the repo has no `tap/autonomy.md` on its main branch (`git show origin/<default-branch>:tap/autonomy.md` fails), or when asked ("draft autonomy"). Asked for on its own, it skips the rest of the audit and reuses `tap/audit.md`, scanning only what it still needs.

Write `tap/autonomy.md` in the format from [blast-radius/references/autonomy.md](../blast-radius/references/autonomy.md), filled from the scan:

- **Ceiling** — the proposed merge ceiling. A ceiling the operator states when asking replaces the proposed one.
- **Delivery** — `pr` or `main`, from how recent work reached the main branch.
- **Plan gate** — `all`.
- **Never auto** — what should never go without a human in this repo and why: changes whose effect a revert doesn't undo and that reach users or other systems (native app code and runtime versions, published packages, billing, infrastructure definitions). Sentences, with known paths as examples. Don't repeat the built-in list from the reference; if nothing else qualifies, say so.
- **Contracts** — interfaces this repo owns that another repo consumes (an API schema, published types, an event or payload shape): which repo, and why it can't change freely. Name the interface itself, with its file, not the code behind it. What this repo consumes from others is not its contract.
- Every Never auto and Contracts entry closes the tap for every change that matches it, so list few and keep each narrow. The ceiling and the required checks already cover ordinary risk; an entry is for what they can't. Candidates you considered and left out go in the PR body under "Considered, not listed", with the reason, so the operator can add them.
- **Required checks** — the exact names of the checks that run on PRs, as the code host reports them.
- **Work list** — the list under `tap/lists/` the repo's work is taken from, if there is one.
- **Verify after merge** — the command or workflow that shows a merge is healthy, and what success looks like. Only what the merge itself triggers, looked up by the merge commit (`gh run list --workflow <file> --commit <sha>`), never "the latest run" and never a scheduled run: a failing entry here stops every later merge in the repo.

Then open it as a PR on its own branch, with the reason for each entry in the body. Never merges it: the policy takes effect when the operator merges the PR, and they can change anything first. If the repo already has a PR in progress that the operator asked to carry the draft, commit it there instead.

Where a policy already exists on the main branch, propose changes the same way, as a PR. Never edit it in place and never push it to the main branch.

### 7. Present Findings

**Human mode (default):**

Always open with the signature block:

```
`★ Audit View ─────`
[repo name] — [readiness score]
  ├─ [top feedback loop finding]
  ├─ [#1 leverage point]
  └─ [cheapest fix to start with]
`───── ★`
```

Close with the `───── ★` line exactly as shown — tools read it.

Then:
- Summarize readiness score and what it means
- Highlight top 2-3 leverage points
- Propose the single cheapest fix to start with
- Ask if they want to address any leverage points now

**Agent mode (invoked with `--agent` or in automated pipeline):**
- Write tap/audit.md and tap/architecture.md silently
- Log readiness score
- Proceed to assigned task

## Wire discoverability

`tap/audit.md` and `tap/architecture.md` are only read by agents that know they exist — CLAUDE.md is the only file loaded automatically. After writing, check the repo's CLAUDE.md for a `tap/` context-index line:

- **Index line exists** → make sure it mentions `audit.md` (readiness scorecard) and `architecture.md` (system decisions); append if missing.
- **No index line** → add one (show the diff, write on confirm): `Durable project context lives in tap/ — audit.md (readiness scorecard), architecture.md (system decisions)[, plus any other tap/ files present]. Read the relevant file before deciding in that area.`
- **No CLAUDE.md** → tell the user the artifacts are invisible to agents until something references them; offer a minimal CLAUDE.md containing just that pointer.

## Boundaries

- Does NOT describe the tech stack (CLAUDE.md's job)
- Does NOT set coding conventions (CLAUDE.md's job)
- Does NOT measure team dynamics like review turnaround (out of scope here)
- Does NOT modify any code or config — read-only assessment
- Drafts the autonomy policy; it takes effect only when the operator merges the PR
