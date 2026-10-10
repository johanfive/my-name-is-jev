#!/bin/sh
# Claude Code SessionStart hook: tell the human once when the Node the hooks need is missing.
# Plain sh on purpose: this is the one hook that must run without Node. Every other hook fails
# open, so without this the user would believe nij is working while nothing runs.
NODE_MIN=24
version=$(node --version 2>/dev/null)
major=$(printf '%s' "$version" | sed 's/^v\([0-9]*\).*/\1/')
if [ -z "$version" ]; then
  found="no node on PATH"
elif [ "$major" -lt "$NODE_MIN" ] 2>/dev/null; then
  found="node $version on PATH"
else
  exit 0
fi
printf '{"systemMessage":"nij: needs Node %s or later, found %s. The naming checks are off until then."}' \
  "$NODE_MIN" "$found"
