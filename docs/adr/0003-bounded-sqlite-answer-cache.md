# 0003 Jev answers live in one bounded SQLite file

**Context.** Answers were cached in one JSON file per project, read and rewritten whole on
every hook call, never pruned, and named by a path hash nobody could map back to a project.
The cache saves a few hundred milliseconds, not money, so it may be bounded aggressively.

**Decision.** One `cache.sqlite` under the cache directory, using Node's built-in `node:sqlite`.
One row per question with a last-used time. On open, rows past `maxEntries` (20000) or
`maxAgeDays` (30) are deleted. `cache: false` disables it; `nij cache` reports and clears it.
Any failure to open runs without a cache rather than failing.

**Alternatives.** Cap and prune the JSON file: bounded, but still parses and rewrites the whole
file per call. Per-project files: keys already carry the project path, so they only produced
orphans. No cache: every rerun and every `explain` pays the network.
