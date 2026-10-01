# 0005 A user-level config layers under the project config

**Context.** A user wants rules that follow them into every project, a project wants rules that
apply to everyone working in it, and the two can coexist. A project a user does not own must
be able to silence the user's own rules without touching the repository.

**Decision.** Two files, both optional: `nij.config.ts` in the project root and one in the
user-level directory (`NIJ_CONFIG_DIR`, set by an adapter to the agent's own config directory,
else the OS convention). Rules layer: user-level first, project after, and a project rule with
the same `id` replaces the user-level one. Each layer's default severity applies to its own rules;
the other settings take the project's value when set. A project
config with `global: false` ignores the user-level file; in a repo one does not own, that file
can be local and gitignored.

**Alternatives.** Project replaces user-level: no personal baseline inside a configured
project. Explicit `extends` with a path: ceremony, and a home path in a committed file.
