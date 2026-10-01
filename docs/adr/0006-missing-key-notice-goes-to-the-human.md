# 0006: A missing Jev key is reported to the human, not the agent

## Context

Without a key the judges are skipped and only the mechanical checks run. Claude Code sends a hook's stderr to the
debug log only, so the previous stderr notice reached nobody. The plugin kept silently doing half its job.

## Decision

The adapter collects the key through the plugin's `userConfig`, so install itself asks for it and stores it in the
OS credential store. When the key is still missing, the hook returns a `systemMessage`, once per session, naming
`/plugin configure` and the environment variable. The agent is told nothing.

## Alternatives

- Tell the agent through `additionalContext` and have it relay: costs tokens on every tool call, the agent cannot
  fix an environment variable, and an agent that nags about setup gets the plugin uninstalled.
- Keep the stderr line: invisible outside `claude --debug`.
- Make the key `required`: someone may want the mechanical checks alone.
