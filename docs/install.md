# Install

Requires [Node](https://nodejs.org) 22.18 or later on your `PATH`: the hook runs TypeScript natively.

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
settings file. To set or change it later, to point at another backend such as OpenRouter, or to pick the model:

```
/plugin configure my-name-is-jev
```

Without a key only the mechanical checks run, and a one-line notice says so once per session. The environment
variables `NIJ_JEV_API_KEY`, `NIJ_JEV_BASE_URL` and `NIJ_JEV_MODEL` work too.

Without such a Node on the `PATH` nothing runs, and a one-line notice says so when a session starts.

The `nij` command is on Claude's `PATH` while the plugin is enabled, so you can ask Claude to run `nij stats`
(what became of the names nij flagged in this project), `nij explain <name>` or `nij data`. Everything nij keeps
is one SQLite file in the plugin's data directory, which Claude Code removes when you uninstall the plugin.

Without a `nij.config.ts` the built-in presets apply at `warn`. To change the rules, write one in the project root,
or in `~/.claude/` for every project.

## Claude Code on the web

Cloud sessions don't install plugins from a repository's settings or read your `~/.claude`, so the
plugin comes from the cloud environment instead. In the environment's settings:

- **Setup script:** install the plugin before Claude Code starts.
  ```
  claude plugin marketplace add johanfive/my-name-is-jev && claude plugin install my-name-is-jev@my-name-is-jev
  ```
- **Network secret** (the key never enters the session): type Bearer, the backend's host as the allowed website
  (`openrouter.ai` for OpenRouter), the bare key as the value.
- **Environment variables:**
  ```
  TYPESAFE_API_KEY=placeholder
  NODE_USE_ENV_PROXY=1
  TYPESAFE_BASE_URL=https://openrouter.ai/api
  ```
  The key variable only has to exist: nij and the SDK want one, and the proxy swaps in the real key on the way
  out. `NODE_USE_ENV_PROXY=1` makes Node send its requests through the session's proxy, without which every Jev
  call fails. Leave out `TYPESAFE_BASE_URL` for TypeSafe AI itself, and add `api.typesafe.ai` to the allowed
  domains instead: the default network level blocks it.

The image's Node 22 is recent enough. The hook ignores files outside the project, so try it on a file inside a repository.

## Updates

Claude Code does not update this plugin on its own: `auto-update` is `off` by default for marketplaces Anthropic doesn't
run.  
- To turn it `on`:  
    `/plugin` → **Marketplaces** → `my-name-is-jev` → **Enable auto-update**.
- To update by hand:  
    `/plugin` → **Installed** → **Update now**, or from a shell:

```
claude plugin update my-name-is-jev@my-name-is-jev
```
