---
name: list
description: This skill should be used when the user asks to "make a checklist", "track this with me", "start a list for X", "add to the list", "what's on the list", "what's next", "what am I waiting on", "mark X done", "work the list", "let's knock out the list", or has a project or initiative (business, launch, outreach, admin, personal) with steps split between the user, Claude and other people. Not for engineering implementation plans with agent-runnable checks (that is tap:write-plan).
---

# Together lists

Shared checklists for work done by the user, Claude and other people — Things-style projects that live in the repo as `tap/lists/<slug>.md` and show in the `together` pane (`/together`). Unlike a write-plan plan, nothing here runs unattended: items are picked, worked together, and ticked.

Write lists exactly in the format below — the pane parses it, and anything else is silently left out of the pane. The owner comes first, right after the checkbox.

## Format

One list per file: `tap/lists/<slug>.md`, slug = the title in lowercase kebab-case (`Emma launch` → `emma-launch.md`). Lines outside this grammar are ignored by the pane but kept for humans.

```
# <Title>
Deadline: YYYY-MM-DD                         optional, before the first ##

## <Heading>                                 a group of items, like a Things heading
- [ ] @owner text · today · due YYYY-MM-DD · since YYYY-MM-DD
- [~] @claude text                           in progress (at most one per list)
- [x] @owner text · done YYYY-MM-DD
  → evidence path or url                     indented lines = notes under the item above
```

- **Owner** — `@me`, `@claude`, `@me+claude` (together), or `@<name>` (lowercase, e.g. `@neil`). Anyone other than me/claude means **waiting on them**. No owner = `@me`.
- **Segments** after ` · ` — `today` (do it today), `due YYYY-MM-DD`, `since YYYY-MM-DD` (when the waiting started), `done YYYY-MM-DD` (when it was ticked). Any other segment stays part of the text.
- **State** — `[ ]` open, `[~]` Claude is working on it, `[x]` done. Done items stay where they are; never delete or move items between headings. A dropped item is `[x]` with a `dropped: <why>` note.
- **Notes** — indented lines (2+ spaces) under an item: context for whoever picks it up next (decisions, drafts, links). Evidence for a ticked `@claude` item is a note starting with `→`.
- Items before the first `##` belong to an unnamed heading.

### Example

```list
# Emma launch
Deadline: 2026-10-20

## Admin
- [ ] @me Buy domain · today
- [ ] @neil Confirm pricing changes · since 2026-10-04
- [x] @me Set up Stripe account · done 2026-10-01

## Website
- [~] @claude Update site to v3
  draft: site/copy-v3.md
- [ ] @me+claude Review copy with Alexa · due 2026-10-10
- [x] @claude Draft hero section · done 2026-10-05
  → site/hero-v3.md
```

## Modes

Pick the mode from the request; one request can chain several (capture then work).

### Capture

New list, or items added to an existing one.

1. List `tap/lists/` first. Matching title → append there, never a second file for the same project.
2. Slug = title in lowercase kebab-case. Title is the project's name as the user says it.
3. Group items under `##` headings when the dump has natural groups (website, outreach, admin); otherwise no headings.
4. Owner per item:
   - The user does it (send, call, buy, sign, decide, anything needing their accounts or presence) → `@me`.
   - Claude can do it end-to-end in this environment (draft, research, edit files, compare) → `@claude`.
   - Claude prepares, the user finishes (review with a person, send what Claude drafted) → `@me+claude`.
   - Someone else must act → `@<name>` (lowercase first name) with `· since <today>`. That is a waiting item.
   - Ask only when the owner is truly ambiguous and it changes who acts; otherwise default to `@me`.
5. Add `· today` or `· due YYYY-MM-DD` only when the user said so. Convert relative dates using today's date.
6. Put context the user gave (who, why, links, constraints) as indented notes under the item — the next session picks the item up from these notes alone.
7. Write the file, then confirm in one line per item, grouped by owner.

### Review

1. For each list in `tap/lists/` (or just the one named), run the pane's parser:
   `bun <this skill's base directory>/../../scripts/check-list.ts <file>` → JSON with `done`, `total`, `today`, `next`, `waiting` (with `ageDays`, `isStale`), `overdue`, `daysLeft`. If `bun` is missing, read the file and apply the format rules by hand.
2. Present conversationally, never the raw JSON:
   - **Next for you** — `next` and the other `@me` / `@me+claude` items in `today`.
   - **Claude can do now** — open `@claude` items; offer to start.
   - **Waiting** — stale first (> 3 days), each with a suggested nudge (offer to draft it).
   - **Overdue** and the deadline countdown, when present.
3. End with one recommendation: the single item to do next and who does it.

### Work

1. Mark the chosen item `[~]` (only one per list) so the pane shows it in progress.
2. `@claude` item → do it. Keep outputs in the repo (drafts, research) and link them.
3. `@me` / `@me+claude` item → prepare everything the user needs to finish it in one go: the draft, the exact steps, the links, the open decisions. Then hand it over and return the item to `[ ]` until the user confirms.
4. New facts learned while working (a decision, a reply, a link) → indented notes on the item.
5. Tick per the rules below, then offer the next item.

### Tick

- `@claude` item → `[x]`, append `· done <today>`, and add an evidence note `→ <path or url>` pointing at what was produced. No evidence → not done.
- `@me` or `@me+claude` item → tick only after the user confirms in chat that it happened. Never infer it from silence or from a draft being ready.
- Waiting item answered → tick it with `· done <today>`, and note the answer.
- Handed to someone else → change the owner to `@<name>` and add `· since <today>`.
- Dropped → `[x]` with a note `dropped: <why>`.

## Rules

- Never move items between headings and never delete items or notes — the file is the project's history.
- Keep item text short and verb-first ("Send touch 1 email"); details go in notes.
- One list per project. Different projects get separate files; the pane shows them all.
- After editing a list, mention the pane once per session if it isn't open: `/together <slug>`.
