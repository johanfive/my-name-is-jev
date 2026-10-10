import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** How Claude Code names a plugin's data directory: `<plugin>-<marketplace>`. */
const PLUGIN_DATA_DIR_NAME = "my-name-is-jev-my-name-is-jev";

/**
 * Point nij at Claude Code's native homes, from inside a hook:
 * the plugin's data directory for the cache, the user's Claude directory for a user-level
 * nij.config.ts, and the key and backend the user gave the plugin (`/plugin configure`).
 * An explicit NIJ_* variable still wins.
 */
export function adoptHookHomes() {
  process.env.NIJ_CACHE_DIR ??= process.env.CLAUDE_PLUGIN_DATA ?? resolvePluginDataDir();
  process.env.NIJ_CONFIG_DIR ??= resolveClaudeConfigDir();
  const optionByVar = {
    NIJ_JEV_API_KEY: "CLAUDE_PLUGIN_OPTION_JEV_API_KEY",
    NIJ_JEV_BASE_URL: "CLAUDE_PLUGIN_OPTION_JEV_BASE_URL",
  };
  for (const [nijVar, optionVar] of Object.entries(optionByVar)) {
    if (process.env[optionVar]) process.env[nijVar] ??= process.env[optionVar];
  }
}

/**
 * Point the CLI at the same homes as the hook, when the plugin is installed:
 * `nij stats` has to read what the hook wrote, and `nij explain` the config the hook reads.
 * Without the plugin, the CLI keeps the OS conventions. An explicit NIJ_* variable still wins.
 */
export function adoptInstalledPluginHomes() {
  const dataDir = resolvePluginDataDir();
  if (!existsSync(dataDir)) return;
  process.env.NIJ_CACHE_DIR ??= dataDir;
  process.env.NIJ_CONFIG_DIR ??= resolveClaudeConfigDir();
}

/** Where Claude Code keeps this plugin's data. */
const resolvePluginDataDir = () =>
  join(resolveClaudeConfigDir(), "plugins", "data", PLUGIN_DATA_DIR_NAME);

/** The user's Claude directory: the override Claude Code honours, else its default. */
const resolveClaudeConfigDir = () => process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
