#!/usr/bin/env bash
# Fails when a skill reference dangles, core references labs, or an old name is left under plugins/.
set -uo pipefail
cd "$(dirname "$0")/.."

dangling=0
core_to_labs=0
leftovers=0

while IFS= read -r hit; do
  file=${hit%%$'\t'*}
  ref=${hit#*$'\t'}
  plugin=${ref%%:*}
  skill=${ref#*:}
  case "$skill" in name | skill-name) continue ;; esac
  if [ ! -f "plugins/$plugin/skills/$skill/SKILL.md" ]; then
    echo "dangling: $file → $ref"
    dangling=$((dangling + 1))
  fi
done < <(rg -o --no-heading --no-line-number --field-match-separator $'\t' '\btap(-labs)?:[a-z][a-z-]*[a-z]' \
  --glob '!CHANGELOG.md' --glob '!docs/history/**' --glob '!**/node_modules/**' --glob '!scripts/**' . | sort -u)

while IFS= read -r hit; do
  echo "core→labs: $hit"
  core_to_labs=$((core_to_labs + 1))
done < <(rg -n --no-heading 'tap-labs' plugins/tap)

while IFS= read -r hit; do
  echo "old name: $hit"
  leftovers=$((leftovers + 1))
done < <(rg -n --no-heading 'thoughts/|(^|[^A-Za-z0-9_])\.tap/|dev-skills|tap-skills' plugins --glob '!**/node_modules/**' | cut -c1-200)

echo "$dangling dangling, $core_to_labs core→labs, $leftovers old names"
[ $((dangling + core_to_labs + leftovers)) -eq 0 ]
