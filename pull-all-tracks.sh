#!/bin/bash
# Pull tracks for channels with track_count > 0

bun src/lib/cli.ts channels list --source local --json 2>&1 | \
  grep -v '^r5\.' | \
  jq -r '.[] | select(.track_count > 0) | .slug' | \
  while IFS= read -r slug; do
    echo "Pulling tracks for: $slug"
    bun src/lib/cli.ts tracks pull "$slug"
  done

echo ""
echo "Summary:"
bun src/lib/cli.ts tracks list --source local --json 2>&1 | grep -v '^r5\.' | jq 'length' | xargs echo "Total tracks:"
