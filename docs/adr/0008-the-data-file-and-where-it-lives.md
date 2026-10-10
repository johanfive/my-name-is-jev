# 0008 The data file replaces the cache, and lives where the agent keeps plugin data

**Context.** The SQLite file started as an answer cache (ADR 0003) and was placed where a host
keeps caches (ADR 0004). Since ADR 0007 it also holds the findings log, which is durable data,
not a cache: losing it loses the stats. Meanwhile the hosts settled their conventions. Claude Code
documents one writable location for plugin state, `CLAUDE_PLUGIN_DATA`, kept across updates and
deleted on uninstall; Codex and Copilot give their plugins a data directory too, and export the
same variable name as an alias.

**Decision.** Call it what it is. The file is `nij.sqlite`, the setting is `data` (`data: false`
turns off answers and findings alike), the override is `NIJ_DATA_DIR`, and the CLI command is
`nij data [clear]`. The resolution order of ADR 0004 stands, with data locations in place of
cache ones: `NIJ_DATA_DIR`; the agent's plugin data directory, which the adapter puts into
`NIJ_DATA_DIR` (and the CLI finds on its own when the plugin is installed); the project's
`node_modules/.cache/nij`; else the OS data directory (`~/Library/Application Support`,
`%APPDATA%`, `$XDG_DATA_HOME`). The adapter owns the location; the core only reads `NIJ_DATA_DIR`.

**Alternatives.** Keep the name and explain it: every reader of `cache: false` would have to learn
that it also deletes a log. Two files, a cache and a database: two locations, two prunings, and
nothing gained, since both are bounded the same way. A location of our own (`~/.nij`): outlives
the plugin, and the agents already clean up theirs.
