import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { pathExtractor } from "./parse/path.ts";
import { typescriptExtractor } from "./parse/typescript.ts";
import { resolveProjectDir } from "./project-dir.ts";
import type { Config, ResolvedConfig } from "./types.ts";

const CONFIG_FILE_NAMES = [
  "nij.config.ts",
  "nij.config.mts",
  "nij.config.js",
  "nij.config.mjs",
];

/**
 * Load the project's nij.config.{ts,mts,js,mjs} layered over the user-level one.
 * Without either, the built-in presets apply.
 */
export async function loadConfig(dir = resolveProjectDir()): Promise<ResolvedConfig> {
  const project = await importConfig(dir);
  const global = project?.config.global === false ? null : await importConfig(resolveConfigDir());
  if (!project && !global) return loadDefaultConfig(dir);
  const sources = [global?.file, project?.file].filter((file): file is string => !!file);
  if (global && project) {
    return resolveConfig(layerConfigs(global.config, project.config), sources);
  }
  return resolveConfig((global ?? project)!.config, sources);
}

/**
 * Fill in every default a config leaves out,
 * so the rest of nij never has to check for a missing setting.
 */
export function resolveConfig(config: Config, sources: string[] = []): ResolvedConfig {
  return {
    rules: config.rules,
    severity: config.severity ?? "warn",
    extractors: config.extractors ?? [pathExtractor, typescriptExtractor],
    jev: config.jev ?? {},
    cache:
      config.cache === false
        ? { enabled: false, entriesMax: 0, ageMaxDays: 0 }
        : { enabled: true, entriesMax: 20_000, ageMaxDays: 30, ...config.cache },
    sources,
  };
}

/**
 * Where the user-level config lives:
 * an explicit override (adapters set it to the agent's own config dir), else the OS convention.
 */
export function resolveConfigDir(): string {
  if (process.env.NIJ_CONFIG_DIR) return process.env.NIJ_CONFIG_DIR;
  if (platform() === "win32") {
    return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "nij");
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "nij");
}

/**
 * Import the first nij config file in `dir`.
 * Null when there is none, so the caller can layer configs or fall back to the presets.
 */
async function importConfig(dir: string): Promise<{ file: string; config: Config } | null> {
  const file = CONFIG_FILE_NAMES.map((name) => join(dir, name)).find((path) => existsSync(path));
  if (!file) return null;
  const imported = await import(pathToFileURL(file).href);
  return { file, config: imported.default ?? imported };
}

/**
 * User-level rules first, project rules after;
 * a project rule with the same `id` replaces the user-level one.
 * Each layer's default `severity` applies to its own rules,
 * so a personal `block` never escalates a project's rules.
 * The other settings take the project's value when it sets one.
 */
function layerConfigs(global: Config, project: Config): Config {
  const overridden = new Set(project.rules.map((rule) => rule.id));
  const globalRules = global.rules
    .filter((rule) => !overridden.has(rule.id))
    .map(
      (rule) => ({ ...rule, severity: rule.severity ?? global.severity ?? "warn" }) as typeof rule,
    );
  return {
    ...global,
    ...project,
    severity: project.severity,
    rules: [...globalRules, ...project.rules],
  };
}

/**
 * The built-in presets, with a note on stderr saying so.
 * A project with no config still gets checked, and its author learns why.
 */
async function loadDefaultConfig(dir: string): Promise<ResolvedConfig> {
  process.stderr.write(
    `nij: no nij.config.ts in ${dir} or ${resolveConfigDir()}; the built-in presets apply.\n`,
  );
  // Imported here, not at the top:
  // the presets import the core, and the core must not import them back.
  const { defaultRules } = await import("./built-in/presets/index.ts");
  return resolveConfig({ rules: defaultRules });
}
