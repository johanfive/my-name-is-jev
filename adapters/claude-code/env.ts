import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** How Claude Code names a plugin's data directory: `<plugin>-<marketplace>`. */
const PLUGIN_DATA_DIR_NAME = "my-name-is-jev-my-name-is-jev";

/** The plugin options (`/plugin configure`) and the nij variable each one feeds. */
const OPTION_VAR_BY_NIJ_VAR = {
  NIJ_JEV_API_KEY: "CLAUDE_PLUGIN_OPTION_JEV_API_KEY",
  NIJ_JEV_BASE_URL: "CLAUDE_PLUGIN_OPTION_JEV_BASE_URL",
  NIJ_JEV_MODEL: "CLAUDE_PLUGIN_OPTION_JEV_MODEL",
};

/**
 * Point nij at Claude Code's native homes, from inside a hook:
 * the plugin's data directory for the data file, the user's Claude directory for a user-level
 * nij.config.ts, and the key, backend and model the user gave the plugin.
 * An explicit NIJ_* variable still wins.
 */
export function adoptHookHomes() {
  process.env.NIJ_DATA_DIR ??= process.env.CLAUDE_PLUGIN_DATA ?? resolvePluginDataDir();
  process.env.NIJ_CONFIG_DIR ??= resolveClaudeConfigDir();
  for (const [nijVar, optionVar] of Object.entries(OPTION_VAR_BY_NIJ_VAR)) {
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
  process.env.NIJ_DATA_DIR ??= dataDir;
  process.env.NIJ_CONFIG_DIR ??= resolveClaudeConfigDir();
}

/** Where Claude Code keeps this plugin's data, under a plugins root the user may have moved. */
function resolvePluginDataDir(): string {
  const pluginsRoot =
    process.env.CLAUDE_CODE_PLUGIN_CACHE_DIR ?? join(resolveClaudeConfigDir(), "plugins");
  return join(pluginsRoot, "data", PLUGIN_DATA_DIR_NAME);
}

/** The user's Claude directory: the override Claude Code honours, else its default. */
const resolveClaudeConfigDir = () => process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
