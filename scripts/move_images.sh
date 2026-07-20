#!/usr/bin/env bash
# Moves generated flat-named images from the Cursor assets dir into their
# public/mock-catalog/images/<merchant>/<file>.png slots, per scripts/_img_todo.json.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS="/Users/livs/.cursor/projects/Users-livs-Desktop-livgpt/assets"
cd "$ROOT"

moved=0
missing=0
while IFS=$'\t' read -r flat merchant fname; do
  src="$ASSETS/$flat"
  dst="public/mock-catalog/images/$merchant/$fname"
  if [[ -f "$src" ]]; then
    mkdir -p "$(dirname "$dst")"
    mv "$src" "$dst"
    moved=$((moved+1))
  else
    missing=$((missing+1))
  fi
done < <(python3 -c "
import json
for e in json.load(open('scripts/_img_todo.json')):
    print(e['flat'], e['merchant'], e['filename'], sep='\t')
")
echo "moved=$moved missing=$missing"
echo "total in public: $(find public/mock-catalog/images -type f | wc -l | tr -d ' ')"
