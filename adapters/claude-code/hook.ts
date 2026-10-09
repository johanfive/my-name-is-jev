#!/usr/bin/env node
// Claude Code PreToolUse hook: stdin JSON → stdout JSON. Exits 0 always; the hook never breaks the
// agent.
import { registerHooks } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { text } from "node:stream/consumers";
import { pathToFileURL } from "node:url";
import { handle } from "./handle.ts";

const LIBRARY_NAME = "my-name-is-jev";
/** The key and backend the user gave the plugin (`/plugin configure`), and its data directory. */
const PLUGIN_VAR_BY_NIJ_VAR = {
  NIJ_CACHE_DIR: "CLAUDE_PLUGIN_DATA",
  NIJ_JEV_API_KEY: "CLAUDE_PLUGIN_OPTION_JEV_API_KEY",
  NIJ_JEV_BASE_URL: "CLAUDE_PLUGIN_OPTION_JEV_BASE_URL",
};

await main();

/** Read the tool call, answer it. Errors are logged, never thrown: the agent must not break. */
async function main() {
  aliasLibrary();
  mapPluginEnv();
  const input = await text(process.stdin);
  try {
    const output = await handle(JSON.parse(input));
    if (output) process.stdout.write(JSON.stringify(output));
  } catch (err) {
    process.stderr.write(`nij: ${(err as Error).message}\n`);
  }
}

/**
 * Resolve imports of the library to this plugin.
 * A user-level nij.config.ts has no node_modules to resolve the library from.
 */
function aliasLibrary() {
  const packageUrl = pathToFileURL(join(import.meta.dirname, "..", "..", "package.json")).href;
  registerHooks({
    resolve: (specifier, context, next) =>
      specifier === LIBRARY_NAME || specifier.startsWith(`${LIBRARY_NAME}/`)
        ? next(specifier, { ...context, parentURL: packageUrl })
        : next(specifier, context),
  });
}

/**
 * Point nij at Claude Code's native homes and at the plugin's settings.
 * An explicit NIJ_* variable still wins.
 */
function mapPluginEnv() {
  for (const [nijVar, pluginVar] of Object.entries(PLUGIN_VAR_BY_NIJ_VAR)) {
    if (process.env[pluginVar]) process.env[nijVar] ??= process.env[pluginVar];
  }
  process.env.NIJ_CONFIG_DIR ??= process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
}
