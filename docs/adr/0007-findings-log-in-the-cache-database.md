# 0007 Flagged names are logged in the cache database

**Context.** Whether a finding is acted on is the measure of whether a rule is worth its noise,
and anecdotes from a few sessions do not answer it. Answering it needs a record of what was
flagged, kept locally, checked later against the code.

**Decision.** The hook writes every finding it reports to a `findings` table in the same
`cache.sqlite` as the Jev answers (ADR 0003): project, rule, kind, name, file, line, session,
outcome and time. A name flagged again by the same rule replaces its earlier row. Rows past
`ageMaxDays` are pruned on open. `cache: false` turns the log off with the cache: a user who
keeps no Jev answers on disk keeps no record of names either, and one switch beats two. Nothing
is printed when a row is written. `nij stats` reads the rows of the current project and tells,
per rule, how many names were renamed, kept or lost with their file, by extracting each file
again today. For that the CLI has to open the database the hook wrote: when the plugin is
installed, the CLI adopts the agent's data and config directories the way the hook does
(ADR 0004's order is unchanged; `NIJ_CACHE_DIR` still overrides), so hook and CLI agree.

**Alternatives.** A separate log file: a second location, a second pruning policy and a parser,
for data the database already holds in one query. An opt-in setting: `nij stats` is useless
without data, and the log costs nothing visible. Recording from the CLI too: `nij check` counts
every declaration as new, so it would log the whole file as flagged.
