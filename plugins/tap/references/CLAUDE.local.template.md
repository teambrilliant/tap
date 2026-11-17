# Local Development Preferences

## Workflow: Think Before Building

When I bring a feature, problem, or idea — before jumping to code:

1. **Auto-route based on readiness**:
   - Check `tap/plans/`, `tap/shapes/`, and `tap/research/` for existing artifacts matching the topic
   - **Plan exists** → skip to implementation, the plan is source of truth
   - **Shape or research exists but no plan** → `/tap:write-plan`
   - **Nothing exists + fuzzy/ambiguous** → `/tap:product-thinker` first (will offer shaping handoff with context passthrough), then plan
   - **Nothing exists + clear and small** → implement directly
   - **Nothing exists + clear but medium/large** → `/tap:write-plan`
2. **STOP before implementing medium/large work** — present the plan and wait for my confirmation before writing code, unless the repo has `tap/autonomy.md` and the plan is `Gate: auto`.
3. **Execute to the contract** — once a plan is approved, `/tap:execute-plan` runs every phase, runs the test suite and `/tap:qa-test` itself, and ends DONE or BLOCKED. No check-ins between phases. Where the repo has `tap/autonomy.md` it ends by running `/tap:ship`.
4. **Customer-facing work** — make sure I can explain and defend it: `/tap:explain` on the plan or the shipped diff.

Open questions must include a recommended resolution with reasoning. Never ask "what do you want?" — propose what you'd do and why, with discarded alternatives. I'll steer if I disagree.

Skip this workflow only when I explicitly say "just do it" or give a precise, scoped instruction (e.g., "rename X to Y").

## Pipeline: work the list

When I say "work the list":

1. Take the first open `@claude` item in the list that `tap/autonomy.md` names under `## Work list` (or the list I name). Mark it `[~]`.
2. Small and clear → build it. Anything else → `/tap:write-plan`.
3. The plan is `Gate: human` → give me the item: owner `@me`, a note with the plan's path. Go to 1.
4. `/tap:execute-plan` (or `/tap:ship` if there was no plan). It builds, verifies and ships.
5. `Outcome: merged` → the item is ticked with a `→` note. Any other outcome → the item is mine, with the reason and the link.
6. Go to 1. Stop when no `@claude` item is open.

To run it unattended, start one session per item: `claude -p "work the list, one item"`.

## Git

Never force push. When a force push is absolutely necessary (e.g. after rebase), use `--force-with-lease` on a feature branch only — never on main.

Always run `git add`, `git commit`, and `git push` as separate commands — never chain them with `&&`.
