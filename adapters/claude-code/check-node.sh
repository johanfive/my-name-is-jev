#!/bin/sh
# Claude Code SessionStart hook: tell the human once when the Node the hooks need is missing.
# Plain sh on purpose: this is the one hook that must run without Node. Every other hook fails
# open, so without this the user would believe nij is working while nothing runs.
# The floor is what the hooks need at run time: TypeScript without a flag, which came in 22.18
# (and in 23.6 on the 23 line). Developing nij needs more (engines in package.json); running it
# does not, so Node 22 cloud images work.
NODE_MIN_MAJOR=22
NODE_MIN_MINOR=18
version=$(node --version 2>/dev/null)
major=$(printf '%s' "$version" | sed 's/^v\([0-9]*\).*/\1/')
minor=$(printf '%s' "$version" | sed 's/^v[0-9]*\.\([0-9]*\).*/\1/')
if [ -z "$version" ]; then
  found="no node on PATH"
elif [ "$major" -lt "$NODE_MIN_MAJOR" ] 2>/dev/null \
  || { [ "$major" -eq "$NODE_MIN_MAJOR" ] && [ "$minor" -lt "$NODE_MIN_MINOR" ]; } 2>/dev/null \
  || { [ "$major" -eq 23 ] && [ "$minor" -lt 6 ]; } 2>/dev/null; then
  found="node $version on PATH"
else
  exit 0
fi
printf '{"systemMessage":"nij: needs Node %s.%s or later, found %s. The naming checks are off until then."}' \
  "$NODE_MIN_MAJOR" "$NODE_MIN_MINOR" "$found"
