#!/bin/zsh
set -euo pipefail

ROOT="/Users/jimmychoi/Library/Mobile Documents/com~apple~CloudDocs/bandihr/bandi_program"
LOCK_DIR="/tmp/bandi_program_autosync.lock"

if ! mkdir "${LOCK_DIR}" 2>/dev/null; then
  exit 0
fi
trap 'rmdir "${LOCK_DIR}"' EXIT

cd "${ROOT}"

# Let Excel finish writing the workbook before parsing.
sleep 2

python3 build_program_schedule_workbook_jsons.py --output-dir data/generated
python3 build_program_schedule_bundle.py \
  "data/generated/program_schedule_week[0-9]*.json" \
  "data/generated/program_schedule_workbook_*.json" \
  --output webapp/assets/program_schedule.json

typeset -a workbook_files
while IFS= read -r file; do
  workbook_files+=("${file}")
done < <(find . -maxdepth 1 -type f -name '*.xlsx' ! -name '~$*' -print | sort)

typeset -a generated_files
while IFS= read -r file; do
  generated_files+=("${file}")
done < <(find data/generated -maxdepth 1 -type f -name 'program_schedule_workbook_*.json' -print | sort)

git add webapp/assets/program_schedule.json
if (( ${#generated_files[@]} > 0 )); then
  git add -- "${generated_files[@]}"
fi
if (( ${#workbook_files[@]} > 0 )); then
  git add -- "${workbook_files[@]}"
fi

if git diff --cached --quiet; then
  exit 0
fi

git commit -m "Auto-sync program schedule workbook"
git push origin main
