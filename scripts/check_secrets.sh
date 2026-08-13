#!/bin/sh
set -eu

scan_output=$(
  git ls-files --cached --others --exclude-standard \
    | grep -Ev '^(fixtures/|package-lock\.json$|apps/api/uv\.lock$|LICENSE$)' \
    | xargs uvx --from detect-secrets==1.5.0 detect-secrets scan
)

finding_count=$(printf '%s' "$scan_output" | jq '.results | length')
if [ "$finding_count" -ne 0 ]; then
  printf '%s\n' "$scan_output" | jq '.results'
  exit 1
fi

echo "Secret scan passed for intended text source files."
