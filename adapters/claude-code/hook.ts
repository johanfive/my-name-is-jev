#!/usr/bin/env node
// Claude Code PreToolUse hook: stdin JSON → stdout JSON. Exits 0 always; the hook never breaks the
// agent.
import { registerHooks } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { handle } from "./handle.ts";

// A user-level nij.config.ts has no node_modules to resolve the library from; point the bare
// specifier at this plugin.
const packageRoot = pathToFileURL(join(import.meta.dirname, "..", "..", "package.json")).href;
registerHooks({
  resolve: (specifier, context, next) =>
    specifier === "my-name-is-jev" || specifier.startsWith("my-name-is-jev/")
      ? next(specifier, { ...context, parentURL: packageRoot })
      : next(specifier, context),
});

// Native homes: the plugin's data directory for the cache, the user's Claude directory for a user-
// level nij.config.ts.
if (process.env.CLAUDE_PLUGIN_DATA) process.env.NIJ_CACHE_DIR ??= process.env.CLAUDE_PLUGIN_DATA;
process.env.NIJ_CONFIG_DIR ??= process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
// The key and backend the user gave the plugin (`/plugin configure`); an explicit NIJ_JEV_*
// variable still wins.
if (process.env.CLAUDE_PLUGIN_OPTION_JEV_API_KEY) {
  process.env.NIJ_JEV_API_KEY ??= process.env.CLAUDE_PLUGIN_OPTION_JEV_API_KEY;
}
if (process.env.CLAUDE_PLUGIN_OPTION_JEV_BASE_URL) {
  process.env.NIJ_JEV_BASE_URL ??= process.env.CLAUDE_PLUGIN_OPTION_JEV_BASE_URL;
}

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

try {
  const out = await handle(JSON.parse(raw));
  if (out) process.stdout.write(JSON.stringify(out));
} catch (err) {
  process.stderr.write(`nij: ${(err as Error).message}\n`);
}
