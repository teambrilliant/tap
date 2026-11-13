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
2. **STOP before implementing medium/large work** — present the plan and wait for my confirmation before writing code.
3. **Execute to the contract** — once a plan is approved, `/tap:execute-plan` runs every phase, runs the test suite and `/tap:qa-test` itself, and ends DONE or BLOCKED. No check-ins between phases.
4. **Customer-facing work** — make sure I can explain and defend it: `/tap:explain` on the plan or the shipped diff.

Open questions must include a recommended resolution with reasoning. Never ask "what do you want?" — propose what you'd do and why, with discarded alternatives. I'll steer if I disagree.

Skip this workflow only when I explicitly say "just do it" or give a precise, scoped instruction (e.g., "rename X to Y").

## Git

Never force push. When a force push is absolutely necessary (e.g. after rebase), use `--force-with-lease` on a feature branch only — never on main.

Always run `git add`, `git commit`, and `git push` as separate commands — never chain them with `&&`.
