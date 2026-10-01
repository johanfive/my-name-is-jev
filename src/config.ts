import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { pathExtractor } from "./parse/path.ts";
import { typescriptExtractor } from "./parse/typescript.ts";
import { resolveProjectDir } from "./jev-client.ts";
import type { Config, ResolvedConfig } from "./types.ts";

/** Where the user-level config lives: an explicit override (adapters set it to the agent's own config dir), else the OS convention. */
export function resolveConfigDir(): string {
  if (process.env.NIJ_CONFIG_DIR) return process.env.NIJ_CONFIG_DIR;
  if (platform() === "win32") return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "nij");
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "nij");
}

export function resolve(config: Config, sources: string[] = []): ResolvedConfig {
  return {
    rules: config.rules,
    severity: config.severity ?? "warn",
    extractors: config.extractors ?? [pathExtractor, typescriptExtractor],
    jev: config.jev ?? {},
    cache: config.cache === false ? { enabled: false, maxEntries: 0, maxAgeDays: 0 } : { enabled: true, maxEntries: 20_000, maxAgeDays: 30, ...config.cache },
    sources,
  };
}

async function importConfig(dir: string): Promise<{ file: string; config: Config } | null> {
  for (const ext of ["ts", "mts", "js", "mjs"]) {
    const file = join(dir, `nij.config.${ext}`);
    if (!existsSync(file)) continue;
    const mod = await import(pathToFileURL(file).href);
    return { file, config: mod.default ?? mod };
  }
  return null;
}

/**
 * User-level rules first, project rules after; a project rule with the same `id` replaces the user-level one.
 * Each layer's default `severity` applies to its own rules, so a personal `block` never escalates a project's rules.
 * The other settings take the project's value when it sets one.
 */
function layer(global: Config, project: Config): Config {
  const overridden = new Set(project.rules.map((r) => r.id));
  const globalRules = global.rules.filter((r) => !overridden.has(r.id)).map((r) => ({ ...r, severity: r.severity ?? global.severity ?? "warn" }) as typeof r);
  return { ...global, ...project, severity: project.severity, rules: [...globalRules, ...project.rules] };
}

/** Load the project's nij.config.{ts,mts,js,mjs} layered over the user-level one. Without either, the built-in presets apply. */
export async function loadConfig(dir = resolveProjectDir()): Promise<ResolvedConfig> {
  const project = await importConfig(dir);
  const global = project?.config.global === false ? null : await importConfig(resolveConfigDir());
  if (!project && !global) {
    process.stderr.write(`nij: no nij.config.ts in ${dir} or ${resolveConfigDir()}; the built-in presets apply.\n`);
    // Imported here, not at the top: the presets import the core, and the core must not import them back.
    const presets = await import("./built-in/presets/index.ts");
    return resolve({ rules: [...presets.typescript, ...presets.functionsStartWithVerb, ...presets.stableToVariable] });
  }
  const sources = [global?.file, project?.file].filter((f): f is string => !!f);
  if (global && project) return resolve(layer(global.config, project.config), sources);
  return resolve((global ?? project)!.config, sources);
}
