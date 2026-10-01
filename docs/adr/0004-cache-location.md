# 0004 The cache lives where the host expects a cache

**Context.** The answer cache is the only file the library writes. `~/.cache/nij` is the Linux
convention and felt arbitrary elsewhere; a coding agent and the JavaScript ecosystem each have
a place users already expect a plugin or a tool to keep its state.

**Decision.** Resolve the directory in order: `NIJ_CACHE_DIR`; the agent's plugin data directory,
which the adapter puts into `NIJ_CACHE_DIR` (Claude Code: `CLAUDE_PLUGIN_DATA`); the project's
`node_modules/.cache/nij` when `node_modules` exists, so the file is gitignored and dies with the
project; else the OS cache directory (`~/Library/Caches`, `%LOCALAPPDATA%`, `$XDG_CACHE_HOME`).
The agent's directory outranks `node_modules` because that is where a plugin user looks, and a
plugin user may never have installed the package.

**Alternatives.** XDG everywhere: standard on Linux, foreign on macOS and Windows. A dotdir in
the project: pollutes the tree and needs a gitignore entry. Home only: outlives every project.
