#!/usr/bin/env bash
# Move a repo from the old thoughts/ + .tap/ layout to tap/, and rename plugin references.
# Dry run unless --apply is passed. Never commits.
#
#   scripts/migrate-repo.sh <repo>            print what would change
#   scripts/migrate-repo.sh --apply <repo>    do it
set -euo pipefail

apply=0
repo=""
for arg in "$@"; do
  case "$arg" in
    --apply) apply=1 ;;
    --dry-run) apply=0 ;;
    *) repo=$arg ;;
  esac
done
[ -n "$repo" ] || { echo "usage: migrate-repo.sh [--apply] <repo>" >&2; exit 2; }
cd "$repo"
git rev-parse --show-toplevel >/dev/null 2>&1 || { echo "not a git repo: $repo" >&2; exit 2; }
cd "$(git rev-parse --show-toplevel)"

CORE="write-plan execute-plan product-thinker explain qa-test strategic-thinker shaping-work blast-radius tighten-loop tap-audit qa-smoke-run qa-smoke-catalog"
OLD_REFS='thoughts/|(^|[^A-Za-z0-9_])\.tap/|dev-skills|tap-skills'

say() { echo "  $*"; }
run() { if [ "$apply" -eq 1 ]; then "$@"; fi; }
is_tracked() { [ -n "$(git ls-files -- "$1" | head -1)" ]; }
move() {
  local src=$1 dst=$2
  say "move  $src → $dst"
  if [ "$apply" -eq 1 ]; then
    mkdir -p "$(dirname "$dst")"
    if is_tracked "$src"; then git mv "$src" "$dst"; else mv "$src" "$dst"; fi
  fi
}

# --- refuse before touching anything
if [ "$apply" -eq 1 ] && [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "tracked files have uncommitted changes; commit or stash first" >&2
  exit 1
fi
if [ -e tap ] && [ -d thoughts ]; then
  echo "tap/ and thoughts/ both exist; merge them by hand" >&2
  exit 1
fi
if [ -d .tap ]; then
  for entry in .tap/* .tap/.[!.]*; do
    [ -e "$entry" ] || continue
    name=$(basename "$entry")
    [ "$name" = "tap-audit.md" ] && name="audit.md"
    if [ -e "tap/$name" ] || [ -e "thoughts/$name" ]; then
      echo "conflict: $entry would overwrite tap/$name" >&2
      exit 1
    fi
  done
fi

echo "$( [ "$apply" -eq 1 ] && echo "Applying to" || echo "Dry run for" ) $(pwd)"

# --- 1. directories
if [ -d thoughts ]; then
  move thoughts tap
fi
if [ -d .tap ]; then
  for entry in .tap/* .tap/.[!.]*; do
    [ -e "$entry" ] || continue
    name=$(basename "$entry")
    [ "$name" = "tap-audit.md" ] && name="audit.md"
    move "$entry" "tap/$name"
  done
  run rmdir .tap 2>/dev/null || true
fi

# --- 2. .gitignore
if [ -f .gitignore ] && rg -q '^/?(thoughts|\.tap)/?$' .gitignore; then
  say "edit  .gitignore: drop the thoughts/ and .tap/ lines (tap/ is committed)"
  run perl -ni -e 'print unless m{^/?(thoughts|\.tap)/?\s*$}' .gitignore
fi

# --- 3. text references in instruction files and in the moved docs
rewrite() {
  CORE="$CORE" perl -pi -e '
    BEGIN { %core = map { $_ => 1 } split / /, $ENV{CORE} }
    s{(?:dev-skills|tap-skills):([a-z][a-z-]*[a-z])}{ ($core{$1} ? "tap" : "tap-labs") . ":$1" }ge;
    s{(dev-skills|tap-skills)\@teambrilliant-marketplace}{tap\@teambrilliant-marketplace}g;
    s{thoughts\@teambrilliant-marketplace}{tap-pane\@teambrilliant-marketplace}g;
    s{together\@akurkin-plugins}{together\@teambrilliant-marketplace}g;
    s{thoughts/}{tap/}g;
    s{(?<![A-Za-z0-9_])\.tap/}{tap/}g;
    s{tap/tap-audit\.md}{tap/audit.md}g;
  ' "$1"
}
docs_dir=tap
[ "$apply" -eq 0 ] && [ -d thoughts ] && docs_dir=thoughts
{
  git ls-files -co --exclude-standard -- 'CLAUDE.md' '**/CLAUDE.md' 'CLAUDE.local.md' '**/CLAUDE.local.md' 'AGENTS.md' '**/AGENTS.md' 2>/dev/null
  [ -f CLAUDE.local.md ] && echo CLAUDE.local.md
  for dir in "$docs_dir" .tap; do
    [ -d "$dir" ] && find "$dir" -type f -name '*.md'
  done
} | sort -u | while IFS= read -r file; do
  [ -f "$file" ] || continue
  count=$(rg -c "$OLD_REFS" "$file" 2>/dev/null || true)
  [ -n "$count" ] || continue
  echo "  rewrite $file ($count lines with old names or paths)"
  run rewrite "$file"
done

# --- 4. plugin ids in settings
find .claude -type f -name 'settings*.json' 2>/dev/null | sort | while IFS= read -r file; do
  count=$(rg -c 'dev-skills|tap-skills|thoughts@teambrilliant-marketplace|together@akurkin-plugins' "$file" 2>/dev/null || true)
  [ -n "$count" ] || continue
  echo "  rewrite $file ($count lines: plugin ids → tap, tap-pane, together)"
  if [ "$apply" -eq 1 ]; then
    rewrite "$file"
    # two old ids can collapse into one new id; jq keeps a single key
    jq . "$file" >"$file.tmp" && mv "$file.tmp" "$file"
  fi
done

# --- 5. anything else still pointing at the old paths is left for a human
others=$(git ls-files | rg -v '^(thoughts|tap|\.tap)/' | xargs rg -l 'thoughts/|(^|[^A-Za-z0-9_])\.tap/' 2>/dev/null | rg -v '(^|/)(CLAUDE|CLAUDE\.local|AGENTS)\.md$|^\.gitignore$|^\.claude/' || true)
if [ -n "$others" ]; then
  echo "  not rewritten (code or docs that mention the old paths; check by hand):"
  echo "$others" | sed 's/^/    /'
fi

if [ "$apply" -eq 1 ]; then
  echo "Done. Nothing is committed: review with git status and git diff."
else
  echo "Nothing changed. Re-run with --apply to do it."
fi
