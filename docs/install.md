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

Claude Code asks for a Jev API key when it enables the plugin. The key goes to the OS credential store, never to a
settings file. To set or change it later, or to point at another backend such as OpenRouter:

```
/plugin configure my-name-is-jev
```

Without a key only the mechanical checks run, and a one-line notice says so once per session. The environment
variables `NIJ_JEV_API_KEY` and `NIJ_JEV_BASE_URL` work too.

Without a `nij.config.ts` the built-in presets apply at `warn`. To change the rules, write one in the project root,
or in `~/.claude/` for every project.
