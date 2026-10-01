# Install

Requires [Node 24](https://nodejs.org) on your `PATH`: the hook runs TypeScript natively.

Inside a Claude Code session (2.1.275 or later):

```
/plugin install my-name-is-jev --marketplace johanfive/my-name-is-jev
```

Or from a shell:

```
claude plugin marketplace add johanfive/my-name-is-jev
claude plugin install my-name-is-jev@my-name-is-jev
```

Without a `nij.config.ts` the built-in presets apply at `warn`. To change the rules, write one in the
project root, or in `~/.claude/` for every project. The semantic judges need a Jev key
(`NIJ_JEV_API_KEY` or `TYPESAFE_API_KEY`); without one they are skipped and the mechanical checks still run.
