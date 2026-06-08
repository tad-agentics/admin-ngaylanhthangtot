#!/usr/bin/env bash
set -euo pipefail

PROJECT_REF="hptovpbiwvtngorhdhhm"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PATCH="$ROOT/scripts/patch-engagement-functions.py"
WORK="$ROOT/.deploy/edge-work"

FUNCTIONS=(
  day-luan-chat
  generate-reading-la-so
  generate-reading-luu-nien
)

for fn in "${FUNCTIONS[@]}"; do
  echo "==> $fn"
  rm -rf "$WORK"
  mkdir -p "$WORK"

  supabase functions download "$fn" --project-ref "$PROJECT_REF" --workdir "$WORK"
  python3 "$PATCH" "$WORK" "$fn"

  supabase functions deploy "$fn" \
    --project-ref "$PROJECT_REF" \
    --no-verify-jwt \
    --workdir "$WORK" \
    --use-api
done

echo "Deployed engagement tracking functions."
