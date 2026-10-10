#!/usr/bin/env node
// Claude Code PreToolUse hook: stdin JSON → stdout JSON. Exits 0 always; the hook never breaks the
// agent.
import { registerHooks } from "node:module";
import { join } from "node:path";
import { text } from "node:stream/consumers";
import { pathToFileURL } from "node:url";
import { adoptHookHomes } from "./env.ts";
import { handle } from "./handle.ts";

const LIBRARY_NAME = "my-name-is-jev";

await main();

/** Read the tool call, answer it. Errors are logged, never thrown: the agent must not break. */
async function main() {
  aliasLibrary();
  adoptHookHomes();
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
